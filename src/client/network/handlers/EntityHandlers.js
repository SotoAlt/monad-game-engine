/**
 * Entity-related WebSocket message handlers.
 */

import { state, hazardPlaneState, entityMeshes } from '../../state.js';
import { addEntity, updateEntity, removeEntity, clearAllEntities } from '../../entities/EntityManager.js';
import { spawnParticles } from '../../vfx/ScreenEffects.js';
import { playCrackSound, playBreakSound } from '../../audio/SoundManager.js';
import { getHazardPlaneMesh } from '../../scene/FloorManager.js';
import { updateUI } from '../../ui/GameStatusHUD.js';

export function registerEntityHandlers(room) {
  room.onMessage('entity_spawned', (entity) => {
    console.log('[Event] Entity spawned:', entity.id);
    addEntity(entity);
  });

  room.onMessage('entity_modified', (entity) => {
    updateEntity(entity);
  });

  room.onMessage('entity_destroyed', ({ id }) => {
    const mesh = entityMeshes.get(id);
    if (mesh?.userData.cracking) {
      const entity = mesh.userData.entity;
      const color = entity?.properties?.color || '#aaaaaa';
      spawnParticles(mesh.position, color, 20, 5);
      playBreakSound();
    }
    removeEntity(id);
  });

  room.onMessage('entities_batch', (entities) => {
    for (const entity of entities) addEntity(entity);
  });

  room.onMessage('entities_destroyed_batch', ({ ids }) => {
    for (const id of ids) removeEntity(id);
  });

  room.onMessage('platform_cracking', ({ id }) => {
    const mesh = entityMeshes.get(id);
    if (mesh) {
      mesh.userData.cracking = true;
      mesh.userData.crackStart = Date.now();
      playCrackSound();
    }
  });

  room.onMessage('world_cleared', () => {
    console.log('[Event] World cleared — removing all entities');
    clearAllEntities();
    getHazardPlaneMesh().visible = false;
    Object.assign(hazardPlaneState, { active: false, type: 'lava', height: -10 });
    updateUI();
  });
}
