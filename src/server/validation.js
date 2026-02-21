/**
 * Input validation helpers for WebSocket messages.
 * Guards against malformed or malicious client data.
 */

function isFiniteVec3(arr) {
  return Array.isArray(arr) &&
    arr.length === 3 &&
    arr.every(v => typeof v === 'number' && Number.isFinite(v));
}

function clampVec3(arr, bound) {
  return [
    Math.max(-bound, Math.min(bound, arr[0])),
    Math.max(-bound, Math.min(bound, arr[1])),
    Math.max(-bound, Math.min(bound, arr[2])),
  ];
}

export function isValidPosition(pos) {
  return isFiniteVec3(pos);
}

export function isValidVelocity(vel) {
  return isFiniteVec3(vel);
}

export function isValidEntityId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 64;
}

export function clampPosition(pos, bound = 500) {
  return clampVec3(pos, bound);
}

export function clampVelocity(vel, maxSpeed = 100) {
  return clampVec3(vel, maxSpeed);
}
