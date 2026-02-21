/**
 * HTTP API helpers — world state fetching and polling.
 */

import { state, hazardPlaneState, entityMeshes } from '../state.js';
import { getApiBase } from '../config.js';
import { addEntity, updateEntity, removeEntity } from '../entities/EntityManager.js';
import { updateRemotePlayer } from '../rendering/RemotePlayers.js';
import { showAnnouncement } from '../ui/Announcements.js';
import { updateUI } from '../ui/GameStatusHUD.js';
import { setFloorType, applyEnvironment, updateHazardPlaneMaterial, getHazardPlaneMesh } from '../scene/FloorManager.js';

export function applyWorldState(worldData) {
  if (worldData.physics) state.physics = worldData.physics;
  if (worldData.gameState) state.gameState = worldData.gameState;
  if (worldData.floorType) setFloorType(worldData.floorType);
  if (worldData.environment) applyEnvironment(worldData.environment);
  if (worldData.hazardPlane) {
    Object.assign(hazardPlaneState, worldData.hazardPlane);
    getHazardPlaneMesh().visible = hazardPlaneState.active;
    getHazardPlaneMesh().position.y = hazardPlaneState.height;
    updateHazardPlaneMaterial(hazardPlaneState.type);
  }
  if (worldData.players) {
    for (const p of worldData.players) {
      if (state.room && p.id === state.room.sessionId) continue;
      state.players.set(p.id, p);
      updateRemotePlayer(p);
    }
  }
  for (const entity of worldData.entities || []) {
    addEntity(entity);
  }
  if (worldData.announcements) {
    for (const ann of worldData.announcements) {
      showAnnouncement(ann);
    }
  }
}

export async function fetchInitialState() {
  try {
    const response = await fetch(`${getApiBase()}/world/state`);
    const data = await response.json();
    applyWorldState(data);
    console.log(`[Init] Loaded ${data.entities.length} entities`);
    return true;
  } catch (error) {
    console.error('[Init] Failed to fetch state:', error);
    return false;
  }
}

export async function pollForUpdates() {
  try {
    const response = await fetch(`${getApiBase()}/world/state`);
    const data = await response.json();

    state.physics = data.physics;

    // gameState intentionally omitted — WebSocket is authoritative for phase transitions

    const serverIds = new Set(data.entities.map(e => e.id));

    for (const entity of data.entities) {
      if (!entityMeshes.has(entity.id)) {
        addEntity(entity);
      } else {
        updateEntity(entity);
      }
    }

    for (const id of entityMeshes.keys()) {
      if (!serverIds.has(id)) {
        removeEntity(id);
      }
    }

    updateUI();
  } catch (error) {
    // Silent fail for polling
  }
}
