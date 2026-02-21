/**
 * Entity Manager
 *
 * Entity lifecycle, group assembly, and per-frame animations.
 */

import * as THREE from 'three/webgpu';
import { entityMeshes, groupParents, pendingGroups, entityToGroup, state } from '../state.js';
import { shortAngleDist } from '../math.js';
import { createEntityMesh, getGeometry, clearGeometryCache } from './EntityFactory.js';
import { ANIMATION_BEHAVIORS } from './EntityBehaviors.js';
import { clearMaterialCache } from '../ToonMaterials.js';
import { spatialHashInsert, spatialHashUpdate, spatialHashRemove, spatialHashClear } from '../physics/SpatialHash.js';
import {
  initInstancedBatchManager, isInstanceable,
  addInstancedEntity, removeInstancedEntity,
  updateInstancedEntity, clearAllBatches, instancedEntityIds
} from './InstancedBatchManager.js';

let _scene = null;
let _updateUI = null;

export function initEntityManager(sceneRef, updateUICallback) {
  _scene = sceneRef;
  _updateUI = updateUICallback;
  initInstancedBatchManager(sceneRef);
}

function assembleGroup(groupId) {
  if (groupParents.has(groupId)) return;

  const childMeshes = [];
  for (const [eid, gid] of entityToGroup) {
    if (gid === groupId && entityMeshes.has(eid)) {
      childMeshes.push(entityMeshes.get(eid));
    }
  }
  if (childMeshes.length < 2) return;

  const group = new THREE.Group();
  const firstMesh = childMeshes[0];
  group.position.copy(firstMesh.position);

  for (const mesh of childMeshes) {
    _scene.remove(mesh);
    mesh.position.sub(group.position);
    group.add(mesh);
  }

  _scene.add(group);
  groupParents.set(groupId, group);

  const firstEntity = firstMesh.userData.entity;
  const props = firstEntity?.properties;
  group.userData = { isGroupParent: true, entity: firstEntity };

  if (props?.kinematic || props?.chase) {
    group.userData.targetPosition = firstMesh.userData.targetPosition
      ? firstMesh.userData.targetPosition.clone()
      : null;
  }
  if (props?.rotating) {
    group.userData.rotating = true;
    group.userData.speed = props.speed || 1;
    for (const mesh of childMeshes) {
      mesh.userData.rotating = false;
    }
  }
}

const GROUP_ASSEMBLY_DEBOUNCE_MS = 150;

function scheduleGroupAssembly(groupId) {
  if (groupParents.has(groupId)) return;
  if (pendingGroups.has(groupId)) clearTimeout(pendingGroups.get(groupId));
  pendingGroups.set(groupId, setTimeout(() => {
    pendingGroups.delete(groupId);
    assembleGroup(groupId);
  }, GROUP_ASSEMBLY_DEBOUNCE_MS));
}

export function addEntity(entity) {
  if (entityMeshes.has(entity.id) || instancedEntityIds.has(entity.id)) {
    return;
  }

  if (isInstanceable(entity)) {
    addInstancedEntity(entity);
    state.entities.set(entity.id, entity);
    spatialHashInsert(entity.id, entity.position[0], entity.position[2]);
    _updateUI();
    return;
  }

  const mesh = createEntityMesh(entity);
  _scene.add(mesh);
  entityMeshes.set(entity.id, mesh);
  state.entities.set(entity.id, entity);
  spatialHashInsert(entity.id, entity.position[0], entity.position[2]);

  const groupId = entity.properties?.groupId;
  if (groupId) {
    entityToGroup.set(entity.id, groupId);
    scheduleGroupAssembly(groupId);
  }

  _updateUI();
}

export function setTargetPosition(obj, position) {
  if (!obj.userData.targetPosition) {
    obj.userData.targetPosition = new THREE.Vector3(...position);
  } else {
    obj.userData.targetPosition.set(...position);
  }
}

export function trackLastPosition(obj) {
  if (!obj.userData.lastPosition) {
    obj.userData.lastPosition = obj.position.clone();
  } else {
    obj.userData.lastPosition.copy(obj.position);
  }
}

export function updateEntity(entity) {
  if (instancedEntityIds.has(entity.id)) {
    updateInstancedEntity(entity);
    state.entities.set(entity.id, entity);
    spatialHashUpdate(entity.id, entity.position[0], entity.position[2]);
    _updateUI();
    return;
  }

  const mesh = entityMeshes.get(entity.id);
  if (!mesh) {
    return addEntity(entity);
  }

  const groupId = entityToGroup.get(entity.id);
  const group = groupId ? groupParents.get(groupId) : null;

  setTargetPosition(mesh, entity.position);

  const entityProps = entity.properties;
  if (group && (entityProps?.kinematic || entityProps?.chase)) {
    setTargetPosition(group, entity.position);
    group.userData.entity = entity;
  } else if (!entityProps?.kinematic && !group) {
    mesh.position.set(...entity.position);
  }

  if (entity.size) {
    mesh.geometry = getGeometry(entity);
  }

  if (entity.properties?.color) {
    if (!mesh.userData._materialCloned) {
      mesh.material = mesh.material.clone();
      mesh.userData._materialCloned = true;
    }
    mesh.material.color.set(entity.properties.color);
    mesh.material.emissive.set(entity.properties.color);
  }

  if (entity.properties?.rotation && !entity.properties?.rotating) {
    mesh.rotation.set(
      entity.properties.rotation[0] || 0,
      entity.properties.rotation[1] || 0,
      entity.properties.rotation[2] || 0
    );
  }

  mesh.userData.entity = entity;
  mesh.userData.rotating = entity.properties?.rotating;
  mesh.userData.speed = entity.properties?.speed || 1;

  state.entities.set(entity.id, entity);
  spatialHashUpdate(entity.id, entity.position[0], entity.position[2]);
  _updateUI();
}

export function removeEntity(id) {
  if (instancedEntityIds.has(id)) {
    removeInstancedEntity(id);
    state.entities.delete(id);
    spatialHashRemove(id);
    _updateUI();
    return;
  }

  const mesh = entityMeshes.get(id);
  if (!mesh) {
    entityToGroup.delete(id);
    state.entities.delete(id);
    spatialHashRemove(id);
    _updateUI();
    return;
  }

  const groupId = entityToGroup.get(id);
  if (groupId && groupParents.has(groupId)) {
    const group = groupParents.get(groupId);
    group.remove(mesh);
    if (group.children.length === 0) {
      _scene.remove(group);
      groupParents.delete(groupId);
    }
  } else {
    _scene.remove(mesh);
  }

  mesh.traverse((child) => {
    if (!child.material) return;

    const isSharedMaterial = child === mesh && !mesh.userData._materialCloned;
    if (!isSharedMaterial) {
      child.material.dispose();
    }
  });

  entityMeshes.delete(id);
  entityToGroup.delete(id);
  state.entities.delete(id);
  spatialHashRemove(id);
  _updateUI();
}

export function clearAllEntities() {
  for (const mesh of entityMeshes.values()) {
    _scene.remove(mesh);
    mesh.traverse((child) => {
      if (child.material) child.material.dispose();
    });
  }
  entityMeshes.clear();
  state.entities.clear();
  for (const group of groupParents.values()) _scene.remove(group);
  groupParents.clear();
  entityToGroup.clear();
  for (const tid of pendingGroups.values()) clearTimeout(tid);
  pendingGroups.clear();
  clearGeometryCache();
  clearMaterialCache();
  spatialHashClear();
  clearAllBatches();
}

export function animateGroups(delta) {
  for (const [, group] of groupParents) {
    if (group.userData.targetPosition) {
      trackLastPosition(group);
      group.position.lerp(group.userData.targetPosition, 0.2);
    }
    if (group.userData.rotating) {
      group.rotation.y += (group.userData.speed || 1) * delta;
    } else {
      const props = group.userData.entity?.properties;
      if (props?._facing !== undefined) {
        group.rotation.y += shortAngleDist(group.rotation.y, props._facing) * 0.12;
      }
      if (props?.isFloating) {
        const baseY = group.userData.targetPosition
          ? group.userData.targetPosition.y
          : group.position.y;
        group.position.y = baseY + Math.sin(Date.now() * 0.002) * 0.4;
      }
    }
  }
}

export function animateEntities(delta, time) {
  const animationContext = { delta, time, isGrouped: false };

  for (const [, mesh] of entityMeshes) {
    const isGrouped = mesh.parent && mesh.parent !== _scene;
    const entity = mesh.userData.entity;
    const entityType = entity?.type;
    const entityProps = entity?.properties;

    if (entityProps?.kinematic && !isGrouped) {
      trackLastPosition(mesh);
      if (mesh.userData.targetPosition) {
        mesh.position.lerp(mesh.userData.targetPosition, 0.2);
      }
    }

    if (mesh.userData.rotating && !isGrouped) {
      mesh.rotation.y += mesh.userData.speed * delta;
    }

    if (mesh.userData.cracking) {
      if (!mesh.userData._materialCloned) {
        mesh.material = mesh.material.clone();
        mesh.userData._materialCloned = true;
      }
      const elapsed = (Date.now() - mesh.userData.crackStart) / 1000;
      mesh.position.x += (Math.random() - 0.5) * 0.04;
      mesh.position.z += (Math.random() - 0.5) * 0.04;
      mesh.material.transparent = true;
      mesh.material.opacity = Math.max(0.2, 1 - elapsed * 1.5);
    }

    animationContext.isGrouped = isGrouped;

    let behaviorKey = null;
    if (entityType === 'trigger' && entityProps?.isGoal) {
      behaviorKey = 'trigger:isGoal';
    } else if (entityType !== 'trigger') {
      behaviorKey = entityType;
    }

    if (behaviorKey && ANIMATION_BEHAVIORS[behaviorKey]) {
      ANIMATION_BEHAVIORS[behaviorKey](mesh, entity, animationContext);
    }
  }
}
