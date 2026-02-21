/**
 * WebSocket message handler dispatcher.
 * Delegates to domain-grouped handlers in ./handlers/.
 */

import { registerEntityHandlers } from './handlers/EntityHandlers.js';
import { registerPlayerHandlers } from './handlers/PlayerHandlers.js';
import { registerGameStateHandlers } from './handlers/GameStateHandlers.js';
import { registerEffectHandlers } from './handlers/EffectHandlers.js';

export function registerMessageHandlers(room, { clearSpectating }) {
  registerEntityHandlers(room);
  registerPlayerHandlers(room, { clearSpectating });
  registerGameStateHandlers(room, { clearSpectating });
  registerEffectHandlers(room);
}
