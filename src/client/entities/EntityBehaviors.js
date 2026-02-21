/**
 * Entity Behavior Registry
 *
 * Centralized registry for all entity type-specific behaviors.
 * Adding a new behavior only requires editing this file.
 *
 * Example:
 *   COLLISION_BEHAVIORS['magnetic'] = (entity, ctx) => { ... };
 *   ANIMATION_BEHAVIORS['magnetic'] = (mesh, entity, { time }) => { ... };
 */

import { ENTITY_TYPES } from '../../shared/constants.js';

// Collision Behaviors
// Called from checkCollisions() when player AABB overlaps entity.
// Return 'skip' to bypass platform AABB resolution.

export const COLLISION_BEHAVIORS = {
  [ENTITY_TYPES.COLLECTIBLE]: (entity, ctx) => {
    ctx.sendToServer('collect', { entityId: entity.id });
    ctx.spawnParticles(entity.position, '#f1c40f', 20, 4);
    ctx.spawnParticles(entity.position, '#ffffff', 8, 2);
    ctx.playCollectSound();
    ctx.removeEntity(entity.id);
    return 'skip';
  },

  [ENTITY_TYPES.OBSTACLE]: (entity, ctx) => {
    if (ctx.gamePhase === 'playing' && Date.now() >= ctx.respawnInvulnUntil) {
      ctx.playerDie();
    }
    return 'skip';
  },

  [ENTITY_TYPES.TRIGGER]: (entity, ctx) => {
    const props = entity.properties;
    if (props?.isBounce) {
      ctx.playerVelocity.y = props.bounceForce || 18;
      ctx.player.isGrounded = false;
      ctx.player.isJumping = true;
      ctx.spawnParticles(ctx.playerMesh.position, '#2ecc71', 15, 4);
      ctx.playBounceSound();
      return 'skip';
    }
    if (props?.isSpeedBoost) {
      ctx.boost.speedBoostUntil = Date.now() + (props.boostDuration || 3000);
      ctx.spawnParticles(ctx.playerMesh.position, '#e67e22', 8, 2);
      return 'skip';
    }
    if (props?.isWind) {
      const force = props.windForce || [0, 0, 0];
      const dt = ctx.frameDelta;
      ctx.playerVelocity.x += force[0] * dt;
      ctx.playerVelocity.y += force[1] * dt;
      ctx.playerVelocity.z += force[2] * dt;
      return 'skip';
    }
    ctx.triggerEvent(entity);
    return 'skip';
  },
};

// Surface Effects
// Applied per-frame while standing on an entity. Keyed by property name.

export const SURFACE_EFFECTS = {
  isConveyor: (entity, ctx) => {
    const dir = entity.properties.conveyorDir || [1, 0, 0];
    const speed = entity.properties.conveyorSpeed || 6;
    ctx.playerVelocity.x += dir[0] * speed * ctx.frameDelta;
    ctx.playerVelocity.z += dir[2] * speed * ctx.frameDelta;
  },
};

// Ice constants (exported for updatePlayer)
export const ICE_ACCEL_MULTIPLIER = 0.15;
export const ICE_DECEL_MULTIPLIER = 0.08;

// Animation Behaviors
// Called each frame from animateEntities(). Keyed by entity type or 'trigger:isGoal'.

export const ANIMATION_BEHAVIORS = {
  [ENTITY_TYPES.COLLECTIBLE]: (mesh, entity, { delta, time }) => {
    mesh.rotation.y += delta;
    mesh.position.y = entity.position[1] + Math.sin(time * 1.5 + mesh.id * 0.7) * 0.15;

    const glow = mesh.children[0];
    if (glow?.material) {
      glow.material.opacity = 0.15 + Math.sin(time * 2.5) * 0.12;
    }
  },

  [ENTITY_TYPES.OBSTACLE]: (mesh, _entity, { time, isGrouped }) => {
    if (isGrouped) return;

    if (mesh.material?.emissiveIntensity !== undefined) {
      mesh.material.emissiveIntensity = 0.3 + Math.sin(time * 0.8 + mesh.id * 1.1) * 0.2;
    }

    const pulse = 1 + Math.sin(time * 1.6 + mesh.id * 0.5) * 0.02;
    mesh.scale.set(pulse, pulse, pulse);
  },

  [ENTITY_TYPES.DECORATION]: (mesh, _entity, { delta, time, isGrouped }) => {
    if (isGrouped || mesh.userData.rotating) return;

    mesh.rotation.y += 0.3 * delta;

    if (mesh.userData.entity?.properties?.emissive && mesh.material?.emissiveIntensity !== undefined) {
      mesh.material.emissiveIntensity = 0.5 + Math.sin(time * 4 + mesh.id * 2.3) * 0.2 + Math.sin(time * 7) * 0.1;
    }
  },

  'trigger:isGoal': (mesh, _entity, { delta, time, isGrouped }) => {
    if (isGrouped) return;

    mesh.rotation.y += 1.5 * delta;

    const pulse = 1 + Math.sin(time * 2) * 0.05;
    mesh.scale.set(pulse, pulse, pulse);

    if (mesh.material?.emissiveIntensity !== undefined) {
      mesh.material.emissiveIntensity = 0.5 + Math.sin(time * 3) * 0.25;
    }
  },
};
