/**
 * Remote Players — remote player meshes, name sprites, chat bubbles, interpolation.
 */

import * as THREE from 'three/webgpu';
import { remotePlayers, player, state } from '../state.js';
import { shortAngleDist } from '../math.js';
import { createRemotePlayerCharacter } from '../PlayerVisuals.js';

let _scene = null;

export function initRemotePlayers(sceneRef) {
  _scene = sceneRef;
}

function createNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name || 'Player', 128, 40);
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(3, 0.75, 1);
  sprite.position.y = 2;
  sprite.userData.isNameSprite = true;
  return sprite;
}

function rebuildNameSprite(mesh, name) {
  const old = mesh.children.find(c => c.userData.isNameSprite);
  if (old) {
    if (old.material?.map) old.material.map.dispose();
    if (old.material) old.material.dispose();
    mesh.remove(old);
  }
  mesh.add(createNameSprite(name));
  mesh.userData.playerName = name;
}

function disposeBubbleSprite(mesh, sprite) {
  if (sprite.material?.map) sprite.material.map.dispose();
  if (sprite.material) sprite.material.dispose();
  mesh.remove(sprite);
}

function createChatBubbleSprite(text) {
  const MAX_CHARS = 60;
  const FONT_SIZE = 26;
  const FONT_FAMILY = '"Segoe UI", Arial, sans-serif';
  const PADDING_X = 28;
  const PADDING_Y = 12;
  const POINTER_HEIGHT = 10;
  const CHAT_DURATION = 5000;
  const SPRITE_SCALE = 4;
  const SPRITE_HEIGHT = 2.8;
  const RENDER_ORDER = 999;

  const display = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS - 1) + '\u2026' : text;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const fontStr = `bold ${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.font = fontStr;
  const textWidth = ctx.measureText(display).width;

  const bubbleW = Math.min(canvas.width - 4, textWidth + PADDING_X * 2);
  const bubbleH = FONT_SIZE + PADDING_Y * 2;
  const borderRadius = bubbleH / 2;
  const left = (canvas.width - bubbleW) / 2;
  const top = (canvas.height - POINTER_HEIGHT - bubbleH) / 2;
  const centerX = canvas.width / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  ctx.moveTo(left + borderRadius, top);
  ctx.lineTo(left + bubbleW - borderRadius, top);
  ctx.arcTo(left + bubbleW, top, left + bubbleW, top + borderRadius, borderRadius);
  ctx.lineTo(left + bubbleW, top + bubbleH - borderRadius);
  ctx.arcTo(left + bubbleW, top + bubbleH, left + bubbleW - borderRadius, top + bubbleH, borderRadius);
  ctx.lineTo(centerX + 8, top + bubbleH);
  ctx.lineTo(centerX, top + bubbleH + POINTER_HEIGHT);
  ctx.lineTo(centerX - 8, top + bubbleH);
  ctx.lineTo(left + borderRadius, top + bubbleH);
  ctx.arcTo(left, top + bubbleH, left, top + bubbleH - borderRadius, borderRadius);
  ctx.lineTo(left, top + borderRadius);
  ctx.arcTo(left, top, left + borderRadius, top, borderRadius);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(display, centerX, top + bubbleH / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(SPRITE_SCALE, 1, 1);
  sprite.position.y = SPRITE_HEIGHT;
  sprite.userData.isChatBubble = true;
  sprite.userData.chatExpiry = Date.now() + CHAT_DURATION;
  sprite.renderOrder = RENDER_ORDER;
  return sprite;
}

function createRemotePlayerMesh(playerData) {
  const hue = Math.random();
  const color = new THREE.Color().setHSL(hue, 0.7, 0.5);
  const mesh = createRemotePlayerCharacter(color);

  mesh.add(createNameSprite(playerData.name));

  mesh.userData.playerName = playerData.name || 'Player';

  mesh.userData.targetPosition = new THREE.Vector3();
  mesh.userData.velocity = new THREE.Vector3();
  if (playerData.position) {
    mesh.userData.targetPosition.set(...playerData.position);
    mesh.position.set(...playerData.position);
  }

  return mesh;
}

export function updateRemotePlayer(playerData) {
  let mesh = remotePlayers.get(playerData.id);

  if (!mesh) {
    mesh = createRemotePlayerMesh(playerData);
    remotePlayers.set(playerData.id, mesh);
    _scene.add(mesh);
  } else if (playerData.name && mesh.userData.playerName !== playerData.name) {
    rebuildNameSprite(mesh, playerData.name);
  }

  if (playerData.position) {
    mesh.userData.targetPosition.set(...playerData.position);
  }
  if (playerData.velocity) {
    mesh.userData.velocity.set(...playerData.velocity);
  }
}

export function removeRemotePlayer(id) {
  const mesh = remotePlayers.get(id);
  if (mesh) {
    _scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    remotePlayers.delete(id);
    console.log(`[Remote] Removed player: ${id}`);
  }
}

export function showChatBubble(senderId, text) {
  const isLocalPlayer = state.room && senderId === state.room.sessionId;
  const mesh = isLocalPlayer ? player.mesh : remotePlayers.get(senderId);
  if (!mesh) return;

  const existing = mesh.children.find(c => c.userData.isChatBubble);
  if (existing) disposeBubbleSprite(mesh, existing);

  mesh.add(createChatBubbleSprite(text));
}

export function updateChatBubbles() {
  const now = Date.now();
  const meshes = [player.mesh, ...remotePlayers.values()];
  for (const mesh of meshes) {
    if (!mesh) continue;
    const bubble = mesh.children.find(c => c.userData.isChatBubble);
    if (!bubble) continue;
    const remaining = bubble.userData.chatExpiry - now;
    if (remaining <= 0) {
      disposeBubbleSprite(mesh, bubble);
    } else if (remaining < 500) {
      bubble.material.opacity = remaining / 500;
    }
  }
}

export function interpolateRemotePlayers(delta) {
  for (const [, mesh] of remotePlayers) {
    if (!mesh.userData.targetPosition) continue;

    const vel = mesh.userData.velocity;
    if (vel && (vel.x !== 0 || vel.y !== 0 || vel.z !== 0)) {
      mesh.position.x += vel.x * delta;
      mesh.position.y += vel.y * delta;
      mesh.position.z += vel.z * delta;
    }

    // Delta-scaled blend: ~0.15 at 60fps → factor = 1 - 0.85^(delta*60)
    const blendFactor = 1 - Math.pow(0.85, delta * 60);
    mesh.position.lerp(mesh.userData.targetPosition, blendFactor);

    const dx = mesh.userData.targetPosition.x - mesh.position.x;
    const dz = mesh.userData.targetPosition.z - mesh.position.z;
    if (dx * dx + dz * dz > 0.0025) {
      const targetYaw = Math.atan2(dx, dz);
      mesh.rotation.y += shortAngleDist(mesh.rotation.y, targetYaw) * blendFactor;
    }
  }
}
