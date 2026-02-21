/**
 * PlayerVisuals — Enhanced player character models with toon materials
 *
 * Features:
 *   - Capsule body with expressive eyes (white + pupil + highlight)
 *   - Squash & stretch on jump/land
 *   - Idle bob when stationary
 *   - Leader crown for #1 on leaderboard
 */

import * as THREE from 'three/webgpu';
import { createPlayerToonMaterial } from './ToonMaterials.js';

const LOCAL_PLAYER_COLOR = 0x00ff88;

function addEnhancedEyes(mesh) {
  const eyeGeo = new THREE.SphereGeometry(0.13, 10, 10);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilGeo = new THREE.SphereGeometry(0.07, 8, 8);
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const highlightGeo = new THREE.SphereGeometry(0.025, 6, 6);
  const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  for (const side of [-0.17, 0.17]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side, 0.35, 0.43);

    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0, 0.08);
    eye.add(pupil);

    const highlight = new THREE.Mesh(highlightGeo, highlightMat);
    highlight.position.set(0.03, 0.03, 0.06);
    pupil.add(highlight);

    mesh.add(eye);
  }
}

function addMouth(mesh) {
  const mouthGeo = new THREE.BoxGeometry(0.15, 0.03, 0.02);
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, 0.15, 0.48);
  mesh.add(mouth);
}

function addGlowRing(mesh, color) {
  const ringGeo = new THREE.TorusGeometry(0.6, 0.08, 8, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.75;
  mesh.add(ring);
}

export function createPlayerCharacter() {
  const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
  geometry.computeBoundingSphere();
  const material = createPlayerToonMaterial(LOCAL_PLAYER_COLOR);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 2, 0);
  mesh.castShadow = true;

  addEnhancedEyes(mesh);
  addMouth(mesh);
  addGlowRing(mesh, LOCAL_PLAYER_COLOR);

  return mesh;
}

export function createRemotePlayerCharacter(color) {
  const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
  geometry.computeBoundingSphere();
  const material = createPlayerToonMaterial(color);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;

  addEnhancedEyes(mesh);
  addMouth(mesh);
  addGlowRing(mesh, color);

  return mesh;
}

const REST_SCALE = new THREE.Vector3(1, 1, 1);
const targetScale = new THREE.Vector3(1, 1, 1);

export function updateSquashStretch(mesh, velocityY, isGrounded) {
  if (!mesh) return;

  if (velocityY > 5) {
    const t = Math.min(velocityY / 25, 0.25);
    targetScale.set(1 - t * 0.5, 1 + t, 1 - t * 0.5);
  } else if (velocityY < -10) {
    const t = Math.min(Math.abs(velocityY) / 50, 0.2);
    targetScale.set(1 + t * 0.5, 1 - t, 1 + t * 0.5);
  } else {
    targetScale.copy(REST_SCALE);
  }

  mesh.scale.lerp(targetScale, 0.15);
}

let idleTime = 0;

export function updateIdleBob(mesh, isMoving, delta, baseY) {
  if (!mesh) return baseY;

  if (isMoving) {
    idleTime = 0;
    return baseY;
  }

  idleTime += delta;
  return baseY + Math.sin(idleTime * 2.5) * 0.05;
}

let crownMesh = null;

export function updateLeaderCrown(playerMesh, isLeader) {
  if (!playerMesh) return;

  if (isLeader && !crownMesh) {
    const baseGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.15, 8);
    const pointGeo = new THREE.ConeGeometry(0.08, 0.2, 4);
    const crownMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });

    crownMesh = new THREE.Group();
    const base = new THREE.Mesh(baseGeo, crownMat);
    crownMesh.add(base);

    // Crown points
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const point = new THREE.Mesh(pointGeo, crownMat);
      point.position.set(Math.cos(angle) * 0.25, 0.17, Math.sin(angle) * 0.25);
      crownMesh.add(point);
    }

    crownMesh.position.y = 0.95;
    playerMesh.add(crownMesh);
  } else if (!isLeader && crownMesh) {
    playerMesh.remove(crownMesh);
    crownMesh = null;
  }
}
