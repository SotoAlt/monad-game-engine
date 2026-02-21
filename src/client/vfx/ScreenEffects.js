/**
 * Visual effects — camera shake, screen flash, vignette, particles.
 * Receives scene reference via initScreenEffects().
 */

import * as THREE from 'three/webgpu';
import { cameraShake, particles } from '../state.js';
import { getParticleBudget } from '../PostProcessing.js';
import { createParticleMaterial } from './ParticleUtils.js';

let _scene = null;

export function initScreenEffects(scene) {
  _scene = scene;
}

export function triggerCameraShake(intensity, duration) {
  cameraShake.intensity = intensity;
  cameraShake.duration = duration;
  cameraShake.startTime = Date.now();
}

export function updateCameraShake() {
  const elapsed = Date.now() - cameraShake.startTime;
  if (elapsed >= cameraShake.duration) {
    cameraShake.offset.set(0, 0, 0);
    return;
  }
  const decay = 1 - elapsed / cameraShake.duration;
  const i = cameraShake.intensity * decay;
  cameraShake.offset.set(
    (Math.random() - 0.5) * i,
    (Math.random() - 0.5) * i,
    (Math.random() - 0.5) * i
  );
}

function createOverlay(zIndex) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:${zIndex};opacity:0;transition:opacity 0.3s;`;
  document.body.appendChild(el);
  return el;
}

let screenFlashEl = null;
let vignetteEl = null;

export function screenFlash(color, duration = 300) {
  if (!screenFlashEl) screenFlashEl = createOverlay(300);
  screenFlashEl.style.background = color;
  screenFlashEl.style.transition = 'none';
  screenFlashEl.style.opacity = '0.4';
  requestAnimationFrame(() => {
    screenFlashEl.style.transition = `opacity ${duration}ms`;
    screenFlashEl.style.opacity = '0';
  });
}

export function showVignette(color, duration = 2000) {
  if (!vignetteEl) vignetteEl = createOverlay(299);
  vignetteEl.style.background = `radial-gradient(ellipse at center, transparent 50%, ${color} 100%)`;
  vignetteEl.style.opacity = '0.6';
  setTimeout(() => { vignetteEl.style.opacity = '0'; }, duration);
}

export function spawnParticles(position, color, count = 20, speed = 5) {
  // Enforce particle budget — evict oldest if over limit
  const budget = getParticleBudget();
  while (particles.length >= budget) {
    const oldest = particles.shift();
    _scene.remove(oldest.mesh);
    oldest.mesh.geometry.dispose();
    oldest.mesh.material.dispose();
  }

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  const px = position.x ?? position[0] ?? 0;
  const py = position.y ?? position[1] ?? 0;
  const pz = position.z ?? position[2] ?? 0;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = px;
    positions[i3 + 1] = py;
    positions[i3 + 2] = pz;
    velocities[i3] = (Math.random() - 0.5) * speed;
    velocities[i3 + 1] = Math.random() * speed;
    velocities[i3 + 2] = (Math.random() - 0.5) * speed;
  }

  const posAttr = new THREE.InstancedBufferAttribute(positions, 3);
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('burstPos', posAttr);

  const material = createParticleMaterial(posAttr, {
    color: new THREE.Color(color),
    size: 0.3,
    opacity: 1.0,
    blending: 'normal',
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.count = count;
  _scene.add(mesh);

  particles.push({
    mesh,
    posAttr,
    velocities,
    startTime: Date.now(),
    lifetime: 1500
  });
}

export function updateParticles(dt) {
  const now = Date.now();
  if (!dt || dt <= 0) dt = 0.016; // fallback for first frame

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const elapsed = now - p.startTime;

    if (elapsed >= p.lifetime) {
      _scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      particles.splice(i, 1);
      continue;
    }

    const positions = p.posAttr.array;
    const count = positions.length / 3;
    const vel = p.velocities;

    for (let j = 0; j < count; j++) {
      const j3 = j * 3;
      positions[j3] += vel[j3] * dt;
      positions[j3 + 1] += vel[j3 + 1] * dt;
      positions[j3 + 2] += vel[j3 + 2] * dt;
      vel[j3 + 1] -= 9.8 * dt; // gravity
    }

    p.posAttr.needsUpdate = true;
    p.mesh.material.opacity = 1 - elapsed / p.lifetime;
  }
}
