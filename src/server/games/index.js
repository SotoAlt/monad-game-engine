/**
 * Mini-Games Index
 *
 * Export all mini-game classes for easy importing.
 * Add your own game types here.
 */

import { MiniGame, GAME_TYPES } from '../MiniGame.js';
import { ReachGoal } from './ReachGoal.js';

export { MiniGame, GAME_TYPES, ReachGoal };

// Factory function to create games by type (sync)
export function createGameSync(type, worldState, broadcastFn, config = {}) {
  switch (type) {
    case 'reach':
      return new ReachGoal(worldState, broadcastFn, config);
    // Add your game types here:
    // case 'collect':
    //   return new CollectGame(worldState, broadcastFn, config);
    default:
      throw new Error(`Unknown game type: ${type}. Register it in src/server/games/index.js`);
  }
}
