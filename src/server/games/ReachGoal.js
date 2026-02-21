/**
 * ReachGoal Mini-Game
 *
 * First player to touch the target entity wins.
 * Agent spawns a goal, players race to reach it.
 */

import { MiniGame } from '../MiniGame.js';

// Player hitbox half-widths used for goal reach detection
const PLAYER_HALF_WIDTH = 1;
const PLAYER_HALF_HEIGHT = 2;

export class ReachGoal extends MiniGame {
  constructor(worldState, broadcastFn, config = {}) {
    super(worldState, broadcastFn, { ...config, type: 'reach' });

    this.targetEntityId = config.targetEntityId || null;
    this.goalPosition = config.goalPosition || [
      (Math.random() - 0.5) * 40,  // x: -20..20
      3 + Math.random() * 7,        // y: 3..10
      -10 - Math.random() * 30      // z: -10..-40
    ];
    this.goalSize = config.goalSize || [3, 3, 3];

    // Track who has reached checkpoints (for multi-checkpoint courses)
    this.checkpointsReached = new Map();
  }

  start() {
    super.start();

    // If no target specified, create one
    if (!this.targetEntityId) {
      const goal = this.spawnEntity('trigger', this.goalPosition, this.goalSize, {
        color: '#f1c40f',
        rotating: true,
        speed: 2,
        isGoal: true
      });
      this.targetEntityId = goal.id;
      console.log(`[ReachGoal] Created goal at [${this.goalPosition.join(', ')}]`);
    }

    // Spawn random obstacles between player and goal
    this._spawnRandomObstacles(2 + Math.floor(Math.random() * 3));

    this.announce(`REACH THE GOLDEN GOAL!`, 'challenge');
    return this;
  }

  setupDefaultTricks() {
    // Move the goal to a new random position at 20s
    this.addTrick({ type: 'time', at: 20000 }, 'move_goal');
    // Spawn obstacles near the goal at 40s
    this.addTrick({ type: 'time', at: 40000 }, 'spawn_obstacles');
    // Taunt every 15s
    this.addTrick({ type: 'interval', every: 15000 }, 'announce', {
      text: this._randomTaunt(), type: 'system'
    });
  }

  _randomTaunt() {
    const taunts = [
      'The goal watches and waits...',
      'Getting warmer? Or colder?',
      'Tick tock, challengers!',
      'The Magician grows impatient...',
      'Perhaps a shortcut? No... that would be too easy.'
    ];
    return taunts[Math.floor(Math.random() * taunts.length)];
  }

  checkWinCondition() {
    // Check if any player is touching the target
    const targetEntity = this.worldState.entities.get(this.targetEntityId);
    if (!targetEntity) {
      console.warn('[ReachGoal] Target entity not found');
      return null;
    }

    const targetPos = targetEntity.position;
    const targetSize = targetEntity.size || [3, 3, 3];

    for (const [playerId, player] of this.worldState.players) {
      if (!player.position) continue;

      // Simple AABB check
      const dx = Math.abs(player.position[0] - targetPos[0]);
      const dy = Math.abs(player.position[1] - targetPos[1]);
      const dz = Math.abs(player.position[2] - targetPos[2]);

      const reachX = dx < (targetSize[0] / 2 + PLAYER_HALF_WIDTH);
      const reachY = dy < (targetSize[1] / 2 + PLAYER_HALF_HEIGHT);
      const reachZ = dz < (targetSize[2] / 2 + PLAYER_HALF_WIDTH);

      if (reachX && reachY && reachZ) {
        console.log(`[ReachGoal] Player ${playerId} reached the goal!`);
        return { type: 'win', winnerId: playerId };
      }
    }

    return null;
  }

  executeTrickAction(trick) {
    switch (trick.action) {
      case 'move_goal': {
        const newPos = [
          (Math.random() - 0.5) * 40,
          3 + Math.random() * 8,
          (Math.random() - 0.5) * 40
        ];
        const entity = this.worldState.entities.get(this.targetEntityId);
        if (entity) {
          this.worldState.modifyEntity(this.targetEntityId, { position: newPos });
          this.broadcast('entity_modified', entity);
          this.announce('THE GOAL HAS SHIFTED!', 'system');
        }
        break;
      }
      case 'spawn_obstacles': {
        const goalEntity = this.worldState.entities.get(this.targetEntityId);
        const goalPos = goalEntity?.position || [0, 5, -30];
        for (let i = 0; i < 3; i++) {
          const offset = [(Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10];
          this.spawnEntity('obstacle', [
            goalPos[0] + offset[0],
            goalPos[1] - 2,
            goalPos[2] + offset[2]
          ], [2, 3, 2], { color: '#e74c3c' });
        }
        this.announce('Obstacles appear near the goal!', 'system');
        break;
      }
      case 'spawn_shortcut': {
        // Create a ramp toward the goal for struggling players
        const goalEntity = this.worldState.entities.get(this.targetEntityId);
        const goalPos = goalEntity?.position || [0, 5, -30];
        this.spawnEntity('ramp', [
          goalPos[0] - 5,
          goalPos[1] - 3,
          goalPos[2]
        ], [4, 1, 8], { color: '#2ecc71' });
        this.announce('A mysterious ramp appears...', 'system');
        break;
      }
      default:
        super.executeTrickAction(trick);
    }
  }

  // Handle player touching the goal (called from server when trigger activated)
  onPlayerReachedGoal(playerId) {
    if (!this.isActive) return;
    this.end('win', playerId);
  }

  getResultMessage(result, winnerId) {
    if (result === 'win') {
      const winner = this.worldState.players.get(winnerId);
      return `${winner?.name || 'Player'} REACHED THE GOAL FIRST!`;
    }
    return super.getResultMessage(result, winnerId);
  }
}
