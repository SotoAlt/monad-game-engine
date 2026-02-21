import { randomUUID } from 'crypto';
import {
  VALID_ENTITY_TYPES, DEFAULT_ENTITY_COLORS, MAX_ENTITIES
} from '../../shared/constants.js';

export class EntityManager {
  static MAX_ENTITIES = MAX_ENTITIES;
  static VALID_ENTITY_TYPES = VALID_ENTITY_TYPES;

  constructor() {
    this.entities = new Map();
    this.breakingPlatforms = new Map();
    this._totalCreated = 0;

    // Secondary indices — avoid full entity scans in tick loop
    this._kinematicIds = new Set();  // entity IDs with kinematic + path.length >= 2
    this._chasingIds = new Set();    // entity IDs with chase + groupId
    this._groupIndex = new Map();    // groupId -> Set<entityId>
  }

  get totalCreated() {
    return this._totalCreated;
  }

  _addToIndices(id, entity) {
    const props = entity.properties;
    if (props?.kinematic && props?.path && props.path.length >= 2) {
      this._kinematicIds.add(id);
    }
    if (props?.chase && props?.groupId) {
      this._chasingIds.add(id);
    }
    if (props?.groupId) {
      let group = this._groupIndex.get(props.groupId);
      if (!group) {
        group = new Set();
        this._groupIndex.set(props.groupId, group);
      }
      group.add(id);
    }
  }

  _removeFromIndices(id, entity) {
    this._kinematicIds.delete(id);
    this._chasingIds.delete(id);
    const groupId = entity?.properties?.groupId;
    if (groupId) {
      const group = this._groupIndex.get(groupId);
      if (group) {
        group.delete(id);
        if (group.size === 0) this._groupIndex.delete(groupId);
      }
    }
  }

  spawnEntity(type, position, size = [1, 1, 1], properties = {}) {
    if (!EntityManager.VALID_ENTITY_TYPES.includes(type)) {
      throw new Error(`Invalid entity type: ${type}`);
    }
    if (this.entities.size >= EntityManager.MAX_ENTITIES) {
      throw new Error(`Entity limit reached (${EntityManager.MAX_ENTITIES})`);
    }

    const id = `${type}-${randomUUID().slice(0, 8)}`;
    const entity = {
      id,
      type,
      position: [...position],
      size: [...size],
      properties: {
        color: properties.color || this.getDefaultColor(type),
        kinematic: properties.kinematic ?? false,
        rotating: properties.rotating ?? false,
        speed: properties.speed ?? 1,
        ...properties
      },
      createdAt: Date.now()
    };

    this.entities.set(id, entity);
    this._addToIndices(id, entity);
    this._totalCreated++;

    console.log(`[EntityManager] Spawned ${type} at [${position.join(', ')}] → ${id}`);
    return entity;
  }

  modifyEntity(id, changes) {
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`Entity not found: ${id}`);
    }

    this._removeFromIndices(id, entity);

    if (changes.position) entity.position = [...changes.position];
    if (changes.size) entity.size = [...changes.size];
    if (changes.properties) {
      entity.properties = { ...entity.properties, ...changes.properties };
    }

    this._addToIndices(id, entity);

    entity.modifiedAt = Date.now();
    console.log(`[EntityManager] Modified ${id}`);
    return entity;
  }

  destroyEntity(id) {
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`Entity not found: ${id}`);
    }

    this._removeFromIndices(id, entity);
    this.entities.delete(id);
    console.log(`[EntityManager] Destroyed ${id}`);
  }

  clearEntities() {
    const ids = [...this.entities.keys()];
    this.entities.clear();
    this.breakingPlatforms.clear();
    this._kinematicIds.clear();
    this._chasingIds.clear();
    this._groupIndex.clear();
    console.log(`[EntityManager] Cleared ${ids.length} entities`);
    return ids;
  }

  getEntitiesByGroup(groupId) {
    const idSet = this._groupIndex.get(groupId);
    if (!idSet) return [];
    const result = [];
    for (const id of idSet) {
      const entity = this.entities.get(id);
      if (entity) result.push(entity);
    }
    return result;
  }

  destroyGroup(groupId) {
    const idSet = this._groupIndex.get(groupId);
    if (!idSet) return [];

    const ids = [];
    for (const id of idSet) {
      const entity = this.entities.get(id);
      if (entity) {
        this._kinematicIds.delete(id);
        this._chasingIds.delete(id);
        this.entities.delete(id);
        ids.push(id);
      }
    }
    this._groupIndex.delete(groupId);
    console.log(`[EntityManager] Destroyed group ${groupId} (${ids.length} entities)`);
    return ids;
  }

  startBreaking(entityId) {
    if (this.breakingPlatforms.has(entityId)) return false;

    const entity = this.entities.get(entityId);
    if (!entity || !entity.properties?.breakable) return false;

    const breakDelay = entity.properties.breakDelay || 500;
    const regenDelay = entity.properties.regenDelay || 0; // 0 = no regen

    this.breakingPlatforms.set(entityId, {
      breakAt: Date.now() + breakDelay,
      regenDelay,
      originalEntity: {
        type: entity.type,
        position: [...entity.position],
        size: [...entity.size],
        properties: { ...entity.properties },
      },
    });

    return true;
  }

  processBreakingPlatforms(broadcastFn) {
    const now = Date.now();

    for (const [entityId, info] of this.breakingPlatforms) {
      if (now >= info.breakAt && this.entities.has(entityId)) {
        const entity = this.entities.get(entityId);
        if (entity) this._removeFromIndices(entityId, entity);

        this.entities.delete(entityId);
        broadcastFn('entity_destroyed', { id: entityId });
        console.log(`[EntityManager] Breakable platform destroyed: ${entityId}`);

        if (info.regenDelay > 0) {
          const orig = info.originalEntity;
          setTimeout(() => {
            try {
              const reborn = this.spawnEntity(orig.type, orig.position, orig.size, orig.properties);
              broadcastFn('entity_spawned', reborn);
              console.log(`[EntityManager] Platform regenerated: ${reborn.id}`);
            } catch { /* entity limit or world cleared */ }
          }, info.regenDelay);
        }

        this.breakingPlatforms.delete(entityId);
      }
    }
  }

  updateKinematicEntities(delta) {
    const moved = [];

    for (const id of this._kinematicIds) {
      const entity = this.entities.get(id);
      if (!entity) {
        this._kinematicIds.delete(id);
        continue;
      }

      const path = entity.properties.path;
      if (!path || path.length < 2) continue;

      if (entity._pathProgress === undefined) {
        entity._pathProgress = 0;
        entity._pathDirection = 1;
      }

      const speed = (entity.properties.speed || 2) * delta;
      entity._pathProgress += speed * entity._pathDirection;

      if (entity._pathProgress >= 1) {
        entity._pathProgress = 1;
        entity._pathDirection = -1;
      } else if (entity._pathProgress <= 0) {
        entity._pathProgress = 0;
        entity._pathDirection = 1;
      }

      const start = path[0];
      const end = path.at(-1);
      const t = entity._pathProgress;
      entity.position = [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
        start[2] + (end[2] - start[2]) * t
      ];

      const pdx = end[0] - start[0];
      const pdz = end[2] - start[2];
      if (Math.abs(pdx) > 0.01 || Math.abs(pdz) > 0.01) {
        entity.properties._facing = Math.atan2(pdx * entity._pathDirection, pdz * entity._pathDirection);
      }

      moved.push(entity);
    }
    return moved;
  }

  /**
   * @param {number} delta
   * @param {function} getAlivePositions - () => Array<[x,y,z]>
   */
  updateChasingEntities(delta, getAlivePositions) {
    const moved = [];
    const playerPositions = getAlivePositions();
    if (playerPositions.length === 0) return moved;

    const chaseGroups = new Map();
    for (const id of this._chasingIds) {
      const entity = this.entities.get(id);
      if (!entity) {
        this._chasingIds.delete(id);
        continue;
      }
      const gid = entity.properties.groupId;
      if (!chaseGroups.has(gid)) chaseGroups.set(gid, []);
      chaseGroups.get(gid).push(entity);
    }

    for (const [, entities] of chaseGroups) {
      const leader = entities[0];
      const speed = (leader.properties.speed || 2) * delta;
      const radius = leader.properties.chaseRadius || 20;

      let nearest = null;
      let nearestDist = Infinity;
      for (const pos of playerPositions) {
        const dx = pos[0] - leader.position[0];
        const dz = pos[2] - leader.position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < nearestDist) { nearestDist = dist; nearest = pos; }
      }

      if (!nearest || nearestDist > radius) continue;

      const dx = nearest[0] - leader.position[0];
      const dz = nearest[2] - leader.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.3) continue; // close enough

      const moveX = (dx / dist) * speed;
      const moveZ = (dz / dist) * speed;
      leader.properties._facing = Math.atan2(dx, dz);

      for (const entity of entities) {
        entity.position = [
          entity.position[0] + moveX,
          entity.position[1],
          entity.position[2] + moveZ,
        ];
        moved.push(entity);
      }
    }
    return moved;
  }

  getDefaultColor(type) {
    return DEFAULT_ENTITY_COLORS[type] || '#95a5a6';
  }
}
