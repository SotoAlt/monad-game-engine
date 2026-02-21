/**
 * Client mutable state -- shared across all client modules.
 * Primitives grouped into objects so mutations propagate across module boundaries.
 * Objects/Maps exported directly -- property mutations work fine.
 *
 * Each section is labeled with its owning module(s). Only listed owners should
 * mutate these properties; other modules may read freely.
 */

import * as THREE from 'three/webgpu';
import { isMobile } from './config.js';
import { DEFAULT_SERVER_PHYSICS } from '../shared/constants.js';

// ── Core game state (Owner: GameStateHandlers, HttpApi) ──────────────────────

export const state = {
  entities: new Map(),
  players: new Map(),
  physics: { ...DEFAULT_SERVER_PHYSICS },
  localPlayer: null,
  room: null,
  gameState: { phase: 'lobby' },
  announcements: new Map(),
  connected: false,
  chatFocused: false,
  activeEffects: [],
  respawnPoint: [0, 2, 0],
  isSpectating: false,
  lobbyCountdownTarget: null,
  lobbyReadyAt: null,
  intentionalDisconnect: false,
};
Object.seal(state);

// ── Auth (Owner: main.js via AuthFlow) ───────────────────────────────────────

export const auth = { user: null };

// ── Network (Owner: NetworkManager, ConnectionManager) ───────────────────────

export const network = {
  lastMoveTime: 0,
  reconnectAttempts: 0,
  reconnectionToken: null,
};
export const remotePlayers = new Map();

// ── Player physics (Owner: PhysicsEngine) ────────────────────────────────────

export const player = {
  mesh: null,
  isGrounded: true,
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  isJumping: false,
  jumpHeld: false,
};
export const playerVelocity = new THREE.Vector3();

export const collision = {
  standingOnEntity: null,
  frameDelta: 0.016,
};

export const death = {
  lastDeathTime: 0,
  respawnInvulnUntil: 0,
};

export const boost = { speedBoostUntil: 0 };
export const activatedTriggers = new Map();

// ── Camera & spectator (Owner: CameraController, InputManager) ──────────────

export const camera = {
  yaw: 0,
  pitch: 0.3,
  distance: isMobile ? 25 : 20,
  pointerLocked: false,
};

export const spectator = {
  dragging: false,
  followIndex: -1,
  freeMode: false,
};
export const spectatorPos = new THREE.Vector3(0, 20, 0);

export const cameraShake = {
  intensity: 0,
  duration: 0,
  startTime: 0,
  offset: new THREE.Vector3(),
};

// ── Entity rendering (Owner: EntityManager) ──────────────────────────────────

export const entityMeshes = new Map();
export const groupParents = new Map();
export const pendingGroups = new Map();
export const entityToGroup = new Map();

// ── Environment (Owner: FloorManager, EffectHandlers) ────────────────────────

export const floor = { currentType: 'solid' };
export const hazardPlaneState = { active: false, type: 'lava', height: -10 };

// ── VFX (Owner: ScreenEffects) ───────────────────────────────────────────────

export const particles = [];

// ── UI (Owner: AfkOverlay, GameStatusHUD) ────────────────────────────────────

export const afk = {
  overlay: null,
  countdownInterval: null,
};

export const countdown = {
  intervalId: null,
  lastLobbyTick: 0,
};
