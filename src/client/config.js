/**
 * Client configuration — constants, URL params, physics tuning.
 * No Three.js or DOM dependencies (pure values + URL parsing).
 */

export const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS || '';

// Server URLs
export const isLocalhost = window.location.hostname === 'localhost';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
export const SERVER_URL = isLocalhost
  ? 'ws://localhost:3000'
  : `${wsProtocol}//${window.location.host}`;
export const API_URL = isLocalhost
  ? 'http://localhost:3000'
  : `${window.location.protocol}//${window.location.host}`;

// URL params
export const urlParams = new URLSearchParams(window.location.search);
export const isSpectator = urlParams.get('spectator') === 'true';
export const isDebug = urlParams.get('debug') === 'true';

// Arena selection — mutable, updated after lobby
export let selectedArenaId = urlParams.get('arena') || import.meta.env.VITE_DEFAULT_ARENA || 'default';
export function setSelectedArenaId(id) { selectedArenaId = id; }

export function getApiBase() {
  if (selectedArenaId === 'default') return `${API_URL}/api`;
  return `${API_URL}/api/arenas/${selectedArenaId}`;
}

// Mobile detection
export const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768;

// Physics constants — tuned for Fall Guys / Stumble Guys feel
export const PHYSICS = {
  GRAVITY:            -76.5,
  FALL_MULTIPLIER:    2.2,
  LOW_JUMP_MULTIPLIER: 4.0,
  TERMINAL_VELOCITY:  -60,
  JUMP_FORCE:         26.5,
  COYOTE_TIME:        0.10,
  JUMP_BUFFER_TIME:   0.10,
  WALK_SPEED:         16,
  SPRINT_SPEED:       26,
  GROUND_ACCEL:       80,
  GROUND_DECEL:       60,
  AIR_ACCEL:          30,
  AIR_DECEL:          10,
};

// Camera constants
export const MIN_PITCH = -Math.PI / 6;   // -30 degrees
export const MAX_PITCH = Math.PI / 3;     // 60 degrees
export const MIN_DISTANCE = 8;
export const MAX_DISTANCE = 40;

// Spectator constants
export const SPEC_FLY_SPEED = 30;
export const SPEC_FAST_SPEED = 60;

// Timing & limits
export const MOVE_INTERVAL = 50; // ms — throttle position sends to 20/s
export const MAX_RECONNECT_ATTEMPTS = 10;
export const RECONNECT_BASE_DELAY = 1000;
export const RECONNECT_MAX_DELAY = 30000;
export const JOYSTICK_RADIUS = 50;

// Death thresholds
export const GROUND_Y = 1;           // Standing height on solid/safe floor
export const ABYSS_DEATH_Y = -20;    // Fall-death threshold for 'none' floor
export const LAVA_DEATH_Y = 0;       // Death threshold for lava floor
export const VOID_DEATH_Y = -50;     // Absolute void death for any floor type
export const DEATH_COOLDOWN = 2000;   // 2 seconds between deaths

// Announcements
export const MAX_VISIBLE_ANNOUNCEMENTS = 3;
