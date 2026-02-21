/**
 * InstancedBatchManager — batches static platforms/ramps into InstancedMesh objects.
 *
 * Reduces ~200 draw calls to ~20-30 for typical arenas by grouping entities
 * that share the same geometry (type+shape+size) into a single InstancedMesh.
 *
 * Only truly static entities qualify — anything animated, kinematic, breakable,
 * grouped, or using special materials stays as an individual mesh.
 */

import * as THREE from 'three/webgpu';
import { getGeometryCacheKey, getGeometry } from './EntityFactory.js';
import { createInstancedPlatformMaterial, getEntityColor } from '../ToonMaterials.js';

// Pre-allocated temporaries (avoid per-frame GC)
const _tempMatrix = new THREE.Matrix4();
const _tempPosition = new THREE.Vector3();
const _tempQuaternion = new THREE.Quaternion();
const _tempScale = new THREE.Vector3(1, 1, 1);
const _tempEuler = new THREE.Euler();
const _tempColor = new THREE.Color();
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

const INITIAL_CAPACITY = 128;

let _scene = null;

// batch key (geometry cache key) -> InstancedBatch
const _batches = new Map();
// entityId -> { batchKey, instanceIndex }
const _entityToBatch = new Map();
// Set of entity IDs managed by instancing (exported for fast membership checks)
export const instancedEntityIds = new Set();

class InstancedBatch {
  constructor(geometry, material, capacity = INITIAL_CAPACITY) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.capacity = capacity;
    this.freeSlots = [];
  }
}

export function initInstancedBatchManager(sceneRef) {
  _scene = sceneRef;
}

export function isInstanceable(entity) {
  const type = entity.type;
  if (type !== 'platform' && type !== 'ramp') return false;
  const props = entity.properties || {};
  if (props.kinematic || props.rotating || props.breakable || props.isBreakable) return false;
  if (props.groupId) return false;
  if (props.isConveyor || props.isIce || props.isWind) return false;
  if (props.emissive) return false;
  if (props.opacity != null && props.opacity < 1) return false;
  return true;
}

function _getOrCreateBatch(entity) {
  const batchKey = getGeometryCacheKey(entity);
  let batch = _batches.get(batchKey);
  if (batch) return { batch, batchKey };

  const geometry = getGeometry(entity);
  const material = createInstancedPlatformMaterial();
  batch = new InstancedBatch(geometry, material);
  _batches.set(batchKey, batch);
  _scene.add(batch.mesh);
  return { batch, batchKey };
}

function _buildMatrix(entity) {
  const pos = entity.position;
  _tempPosition.set(pos[0], pos[1], pos[2]);

  const rot = entity.properties?.rotation;
  if (rot) {
    _tempEuler.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    _tempQuaternion.setFromEuler(_tempEuler);
  } else {
    _tempQuaternion.identity();
  }

  _tempScale.set(1, 1, 1);
  _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
}

function _growBatch(batch) {
  const newCapacity = batch.capacity * 2;
  const oldMesh = batch.mesh;

  const newMesh = new THREE.InstancedMesh(oldMesh.geometry, oldMesh.material, newCapacity);
  newMesh.castShadow = true;
  newMesh.receiveShadow = true;
  newMesh.frustumCulled = false;
  newMesh.count = oldMesh.count;

  // Copy instance matrices
  for (let i = 0; i < oldMesh.count; i++) {
    oldMesh.getMatrixAt(i, _tempMatrix);
    newMesh.setMatrixAt(i, _tempMatrix);
  }
  newMesh.instanceMatrix.needsUpdate = true;

  // Copy instance colors
  if (oldMesh.instanceColor) {
    for (let i = 0; i < oldMesh.count; i++) {
      oldMesh.getColorAt(i, _tempColor);
      newMesh.setColorAt(i, _tempColor);
    }
    newMesh.instanceColor.needsUpdate = true;
  }

  _scene.remove(oldMesh);
  oldMesh.dispose();
  _scene.add(newMesh);

  batch.mesh = newMesh;
  batch.capacity = newCapacity;
}

export function addInstancedEntity(entity) {
  if (instancedEntityIds.has(entity.id)) return;

  const { batch, batchKey } = _getOrCreateBatch(entity);

  // Get slot index: reuse freed slot or allocate new
  let index;
  if (batch.freeSlots.length > 0) {
    index = batch.freeSlots.pop();
  } else {
    if (batch.mesh.count >= batch.capacity) {
      _growBatch(batch);
    }
    index = batch.mesh.count++;
  }

  // Set transform
  _buildMatrix(entity);
  batch.mesh.setMatrixAt(index, _tempMatrix);
  batch.mesh.instanceMatrix.needsUpdate = true;

  // Set per-instance color
  const color = getEntityColor(entity.type, entity.properties?.color);
  batch.mesh.setColorAt(index, color);
  batch.mesh.instanceColor.needsUpdate = true;

  // Track
  _entityToBatch.set(entity.id, { batchKey, instanceIndex: index });
  instancedEntityIds.add(entity.id);
}

export function removeInstancedEntity(entityId) {
  const info = _entityToBatch.get(entityId);
  if (!info) return;

  const batch = _batches.get(info.batchKey);
  if (batch) {
    batch.mesh.setMatrixAt(info.instanceIndex, ZERO_MATRIX);
    batch.mesh.instanceMatrix.needsUpdate = true;
    batch.freeSlots.push(info.instanceIndex);
  }

  _entityToBatch.delete(entityId);
  instancedEntityIds.delete(entityId);
}

export function updateInstancedEntity(entity) {
  const info = _entityToBatch.get(entity.id);
  if (!info) return;

  const batch = _batches.get(info.batchKey);
  if (!batch) return;

  _buildMatrix(entity);
  batch.mesh.setMatrixAt(info.instanceIndex, _tempMatrix);
  batch.mesh.instanceMatrix.needsUpdate = true;

  const color = getEntityColor(entity.type, entity.properties?.color);
  batch.mesh.setColorAt(info.instanceIndex, color);
  batch.mesh.instanceColor.needsUpdate = true;
}

export function clearAllBatches() {
  for (const batch of _batches.values()) {
    _scene.remove(batch.mesh);
    // Don't dispose geometry — it's from the shared geometry cache
    batch.mesh.material.dispose();
    batch.mesh.dispose();
  }
  _batches.clear();
  _entityToBatch.clear();
  instancedEntityIds.clear();
}
