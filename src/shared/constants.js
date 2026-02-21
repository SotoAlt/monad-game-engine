/**
 * Shared constants — single source of truth for both client and server.
 *
 * Server managers import from here and re-export on their static properties.
 * Client modules import directly to replace hardcoded string literals.
 */

// ── Entity Types ──────────────────────────────────────────────────────────────

export const ENTITY_TYPES = {
  PLATFORM: 'platform',
  RAMP: 'ramp',
  COLLECTIBLE: 'collectible',
  OBSTACLE: 'obstacle',
  TRIGGER: 'trigger',
  DECORATION: 'decoration',
};

export const VALID_ENTITY_TYPES = Object.values(ENTITY_TYPES);

export const DEFAULT_ENTITY_COLORS = {
  platform: '#3498db',
  ramp: '#2ecc71',
  collectible: '#f1c40f',
  obstacle: '#e74c3c',
  trigger: '#9b59b6',
  decoration: '#95a5a6',
};

export const MAX_ENTITIES = 500;

// ── Game Types ────────────────────────────────────────────────────────────────

export const GAME_TYPES = {
  REACH: 'reach',
  // Add your game types here:
  // COLLECT: 'collect',
  // SURVIVAL: 'survival',
};

export const VALID_GAME_TYPES = Object.values(GAME_TYPES);

// ── Spells / Effects ─────────────────────────────────────────────────────────

export const SPELL = {
  LOW_GRAVITY: 'low_gravity',
  HIGH_GRAVITY: 'high_gravity',
  SPEED_BOOST: 'speed_boost',
  SLOW_MOTION: 'slow_motion',
  BOUNCY: 'bouncy',
};

export const SPELL_TYPES = {
  [SPELL.LOW_GRAVITY]: { name: 'Low Gravity', defaultDuration: 20000 },
  [SPELL.HIGH_GRAVITY]: { name: 'Crushing Gravity', defaultDuration: 15000 },
  [SPELL.SPEED_BOOST]: { name: 'Speed Boost', defaultDuration: 15000 },
  [SPELL.SLOW_MOTION]: { name: 'Slow Motion', defaultDuration: 10000 },
  [SPELL.BOUNCY]: { name: 'Bouncy World', defaultDuration: 20000 },
};

export const SPELL_COOLDOWN = 10000;

// ── Floor Types ───────────────────────────────────────────────────────────────

export const FLOOR_TYPES = {
  SOLID: 'solid',
  NONE: 'none',
  LAVA: 'lava',
};

export const VALID_FLOOR_TYPES = Object.values(FLOOR_TYPES);

// ── Server Physics & Environment Defaults ─────────────────────────────────────

export const DEFAULT_SERVER_PHYSICS = { gravity: -9.8, friction: 0.3, bounce: 0.5 };

export const DEFAULT_ENVIRONMENT = {
  skyColor: '#1a1a2e',
  fogColor: '#1a1a2e',
  fogNear: 50,
  fogFar: 200,
  fogDensity: 0.012,
  ambientColor: '#404040',
  ambientIntensity: 0.5,
  sunColor: '#ffffff',
  sunIntensity: 1.0,
  sunPosition: [50, 100, 50],
  skyPreset: null,
  materialTheme: null,
};
