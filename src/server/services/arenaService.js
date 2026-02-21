import { AIPlayer } from '../AIPlayer.js';
import { WorldState } from '../WorldState.js';

export async function executeAutoBribe(arena, bribeType, bribeId, chain) {
  const ws = arena.worldState;
  const broadcast = arena.broadcastToRoom.bind(arena);

  switch (bribeType) {
    case 'spawn_obstacles':
      for (let i = 0; i < 3; i++) {
        const x = (Math.random() - 0.5) * 30;
        const z = (Math.random() - 0.5) * 30;
        const entity = ws.spawnEntity('obstacle', [x, 2, z], [1.5, 2, 1.5], {
          color: '#e74c3c', rotating: true, speed: 3
        });
        broadcast('entity_spawned', entity);
      }
      break;

    case 'lava_floor':
      ws.setFloorType('lava');
      broadcast('floor_changed', { type: 'lava' });
      break;

    case 'random_spell': {
      const spellTypes = Object.keys(WorldState.SPELL_TYPES);
      const randomType = spellTypes[Math.floor(Math.random() * spellTypes.length)];
      try {
        const spell = ws.castSpell(randomType);
        broadcast('spell_cast', spell);
      } catch (e) {
        broadcast('announcement', ws.announce('The magic fizzles... try again soon!', 'agent', 3000));
        return false;
      }
      break;
    }

    case 'move_goal': {
      if (arena.currentMiniGame?.isActive && arena.currentMiniGame.type === 'reach' && arena.currentMiniGame.targetEntityId) {
        const newPos = [
          (Math.random() - 0.5) * 40,
          3 + Math.random() * 8,
          (Math.random() - 0.5) * 40
        ];
        const updated = ws.modifyEntity(arena.currentMiniGame.targetEntityId, { position: newPos });
        if (updated) {
          broadcast('entity_modified', updated);
          broadcast('announcement', ws.announce('A BRIBE MOVES THE GOAL!', 'system', 5000));
        }
      } else {
        broadcast('announcement', ws.announce('The Magician notes your bribe... the goal will shift next game!', 'agent', 5000));
      }
      break;
    }

    case 'extra_time': {
      if (arena.currentMiniGame?.isActive) {
        arena.currentMiniGame.timeLimit += 15000;
        ws.gameState.timeLimit += 15000;
        broadcast('announcement', ws.announce('EXTRA TIME! +15 seconds!', 'system', 5000));
      } else {
        broadcast('announcement', ws.announce('The Magician pockets the bribe... extra time next game!', 'agent', 5000));
      }
      break;
    }

    default:
      return false;
  }

  await chain.acknowledgeBribe(bribeId, true);
  return true;
}

export function spawnAIPlayers(arena) {
  if (arena.aiPlayers.length > 0) return;
  const broadcast = arena.broadcastToRoom.bind(arena);
  const explorer = new AIPlayer(arena.worldState, broadcast, 'explorer');
  const chaotic = new AIPlayer(arena.worldState, broadcast, 'chaotic');
  arena.aiPlayers.push(explorer, chaotic);
  console.log(`[AI:${arena.id}] Spawned 2 AI players`);
}

export function despawnAIPlayers(arena) {
  const broadcast = arena.broadcastToRoom.bind(arena);
  for (const ai of arena.aiPlayers) {
    arena.worldState.removePlayer(ai.id);
    broadcast('player_left', { id: ai.id });
  }
  arena.aiPlayers.length = 0;
  console.log(`[AI:${arena.id}] Despawned all AI players`);
}

export function setupArenaCallbacks(arena, gameService) {
  const ws = arena.worldState;

  ws.onPlayerJoin = function onPlayerJoin(player) {
    if (player.type === 'ai') return;
    if (ws.gameState.phase === 'lobby' && !ws.autoStartTargetTime) {
      gameService.scheduleAutoStart(arena);
    }
  };

  ws.onPhaseChange = function onPhaseChange(gameState) {
    const broadcast = arena.broadcastToRoom.bind(arena);
    broadcast('game_state_changed', gameState);

    if (gameState.phase === 'lobby') {
      broadcast('world_cleared', {});
      broadcast('physics_changed', ws.physics);
      broadcast('environment_changed', ws.environment);
      broadcast('floor_changed', { type: ws.floorType });
      broadcast('hazard_plane_changed', { ...ws.hazardPlane });
      broadcast('effects_cleared', {});

      const activated = ws.activateSpectators();
      if (activated > 0) {
        broadcast('player_activated', {});
      }

      gameService.scheduleAutoStart(arena);
    } else {
      clearTimeout(arena.autoStartTimer);
      ws.autoStartTargetTime = null;
    }
  };
}
