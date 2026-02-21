/**
 * EnvironmentEffects — Sky dome, stars, ambient particles
 *
 * Sky presets: starfield, sunset, storm, void, aurora
 * Particle types: dust, embers, snow, fireflies, ash, magic
 *
 * Sky dome uses TSL NodeMaterial — no manual time uniform needed.
 */

import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3,
  uniform, normalize, positionWorld,
  max, pow, mix, smoothstep, floor, fract, sin, dot,
  color as colorNode, instancedBufferAttribute
} from 'three/tsl';
import { softCircle, createParticleMaterial } from './vfx/ParticleUtils.js';

let particleSystem = null;
let particleVelocities = null;
let particleType = 'dust';
let skyDome = null;
let starField = null;

const PARTICLE_COUNT = 250;
const PARTICLE_SPREAD = 60;

// ─── Shared Noise (TSL) ────────────────────────────────────

const hash2d = Fn(([p_immutable]) => {
  const p = vec2(p_immutable).toVar();
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
});

const noise2d = Fn(([p_immutable]) => {
  const p = vec2(p_immutable).toVar();
  const i = floor(p);
  const f = fract(p);
  const ff = f.mul(f).mul(f.mul(-2.0).add(3.0));
  const a = hash2d(i);
  const b = hash2d(i.add(vec2(1.0, 0.0)));
  const c = hash2d(i.add(vec2(0.0, 1.0)));
  const d = hash2d(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, ff.x), mix(c, d, ff.x), ff.y);
});

// ─── Sky Dome ───────────────────────────────────────────────

const SKY_PRESETS = {
  starfield: {
    topColor: [0.02, 0.02, 0.08],
    midColor: [0.05, 0.05, 0.15],
    bottomColor: [0.08, 0.08, 0.2],
    cloudBand: 0,
    starsVisible: true,
    starBrightness: 1.0,
  },
  sunset: {
    topColor: [0.1, 0.08, 0.2],
    midColor: [0.6, 0.2, 0.1],
    bottomColor: [0.9, 0.4, 0.15],
    cloudBand: 0.6,
    starsVisible: false,
    starBrightness: 0,
  },
  storm: {
    topColor: [0.05, 0.05, 0.08],
    midColor: [0.15, 0.12, 0.15],
    bottomColor: [0.2, 0.15, 0.12],
    cloudBand: 1.0,
    starsVisible: false,
    starBrightness: 0,
  },
  void: {
    topColor: [0.0, 0.0, 0.02],
    midColor: [0.02, 0.0, 0.06],
    bottomColor: [0.05, 0.02, 0.1],
    cloudBand: 0,
    starsVisible: true,
    starBrightness: 0.6,
  },
  aurora: {
    topColor: [0.02, 0.08, 0.15],
    midColor: [0.05, 0.2, 0.15],
    bottomColor: [0.1, 0.05, 0.2],
    cloudBand: 0.3,
    starsVisible: true,
    starBrightness: 0.8,
  },
};

// Sky uniforms (TSL uniform nodes)
const _topColor = uniform(new THREE.Color(0x1a3050));
const _bottomColor = uniform(new THREE.Color(0x2a3a5e));
const _midColor = uniform(new THREE.Color(0x1e2d48));
const _offset = uniform(20);
const _exponent = uniform(0.6);
const _cloudBand = uniform(0.0);

export function createSkyDome(scene) {
  const skyGeo = new THREE.SphereGeometry(400, 24, 24);
  const skyMat = new THREE.NodeMaterial();
  skyMat.side = THREE.BackSide;
  skyMat.depthWrite = false;

  // TSL fragment: sky gradient with cloud band
  const skyColor = Fn(() => {
    const worldPos = positionWorld;
    const h = normalize(worldPos.add(vec3(0, _offset, 0))).y;
    const t = max(pow(max(h, 0.0), _exponent), 0.0);

    // Three-color gradient: bottom → mid → top
    const lowBlend = mix(_bottomColor.toVec3(), _midColor.toVec3(), t.div(0.4));
    const highBlend = mix(_midColor.toVec3(), _topColor.toVec3(), t.sub(0.4).div(0.6));
    const color = mix(lowBlend, highBlend, smoothstep(0.39, 0.41, t)).toVar();

    // Cloud band at horizon
    const band = smoothstep(0.0, 0.15, h).mul(smoothstep(0.3, 0.15, h));
    const n = noise2d(worldPos.xz.mul(0.015)).mul(0.7).add(noise2d(worldPos.xz.mul(0.03)).mul(0.3));
    color.assign(mix(color, vec3(1.0), band.mul(n).mul(_cloudBand).mul(0.25)));

    return color;
  })();

  skyMat.colorNode = skyColor;

  skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);

  // Star layer
  createStarField(scene);

  return skyDome;
}

const _starOpacity = uniform(0);

function createStarField(scene) {
  const count = 300;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.8 + 0.2);
    const r = 390;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.5 + Math.random() * 1.5;
  }

  const posAttr = new THREE.InstancedBufferAttribute(positions, 3);
  const sizeAttr = new THREE.InstancedBufferAttribute(sizes, 1);
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('starPos', posAttr);
  geo.setAttribute('starSize', sizeAttr);

  const material = new THREE.SpriteNodeMaterial();
  material.positionNode = instancedBufferAttribute(posAttr);
  material.scaleNode = instancedBufferAttribute(sizeAttr);
  material.colorNode = colorNode(0xffffff);
  material.opacityNode = softCircle().mul(_starOpacity);
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;

  starField = new THREE.Mesh(geo, material);
  starField.count = count;
  starField.frustumCulled = false;
  scene.add(starField);
}

export function updateSkyColors(skyColor, fogColor, skyPreset) {
  if (!skyDome) return;

  const preset = skyPreset && SKY_PRESETS[skyPreset];
  if (preset) {
    _topColor.value.setRGB(...preset.topColor);
    _midColor.value.setRGB(...preset.midColor);
    _bottomColor.value.setRGB(...preset.bottomColor);
    _cloudBand.value = preset.cloudBand;

    if (starField) {
      _starOpacity.value = preset.starsVisible ? preset.starBrightness : 0;
      starField.visible = preset.starsVisible;
    }
  } else {
    const top = new THREE.Color(skyColor);
    const bottom = fogColor ? new THREE.Color(fogColor) : top.clone().multiplyScalar(0.6);
    const mid = top.clone().lerp(bottom, 0.5);
    _topColor.value.copy(top);
    _midColor.value.copy(mid);
    _bottomColor.value.copy(bottom);
    _cloudBand.value = 0;

    // Auto-enable stars for dark skies
    if (starField) {
      const brightness = top.r * 0.299 + top.g * 0.587 + top.b * 0.114;
      _starOpacity.value = brightness < 0.15 ? 0.7 : 0;
      starField.visible = brightness < 0.15;
    }
  }
}

// ─── Particles ──────────────────────────────────────────────

function getParticleConfig(type) {
  switch (type) {
    case 'embers':
      return { color: 0xff6622, size: 0.25, velocityY: [0.5, 1.5], velocityXZ: 0.3, opacity: 0.7, blending: 'additive' };
    case 'snow':
      return { color: 0xffffff, size: 0.2, velocityY: [-0.8, -0.3], velocityXZ: 0.5, opacity: 0.6, blending: 'normal' };
    case 'fireflies':
      return { color: 0x88ff44, size: 0.3, velocityY: [-0.2, 0.2], velocityXZ: 0.4, opacity: 0.8, blending: 'additive' };
    case 'ash':
      return { color: 0x888888, size: 0.15, velocityY: [-0.5, -0.1], velocityXZ: 0.3, opacity: 0.4, blending: 'normal' };
    case 'magic':
      return { color: 0xaa66ff, size: 0.2, velocityY: [0.1, 0.5], velocityXZ: 0.6, opacity: 0.7, blending: 'additive' };
    case 'dust':
    default:
      return { color: 0xffffff, size: 0.12, velocityY: [-0.1, 0.1], velocityXZ: 0.2, opacity: 0.35, blending: 'normal' };
  }
}

export function initParticles(scene, type = 'dust') {
  disposeParticles(scene);

  particleType = type;
  const config = getParticleConfig(type);

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  particleVelocities = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * PARTICLE_SPREAD;
    positions[i3 + 1] = Math.random() * 30 + 2;
    positions[i3 + 2] = (Math.random() - 0.5) * PARTICLE_SPREAD;

    particleVelocities[i3] = (Math.random() - 0.5) * config.velocityXZ;
    particleVelocities[i3 + 1] = config.velocityY[0] + Math.random() * (config.velocityY[1] - config.velocityY[0]);
    particleVelocities[i3 + 2] = (Math.random() - 0.5) * config.velocityXZ;
  }

  const posAttr = new THREE.InstancedBufferAttribute(positions, 3);
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('particlePos', posAttr);

  const material = createParticleMaterial(posAttr, config);

  particleSystem = new THREE.Mesh(geo, material);
  particleSystem.count = PARTICLE_COUNT;
  particleSystem.frustumCulled = false;
  scene.add(particleSystem);
}

export function updateEnvironmentEffects(delta, cameraPosition) {
  if (!particleSystem || !particleVelocities) return;

  const posAttr = particleSystem.geometry.attributes.particlePos;
  const positions = posAttr.array;
  const now = Date.now() * 0.001;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    positions[i3] += particleVelocities[i3] * delta;
    positions[i3 + 1] += particleVelocities[i3 + 1] * delta;
    positions[i3 + 2] += particleVelocities[i3 + 2] * delta;

    // Fireflies: sine-wave wander
    if (particleType === 'fireflies') {
      positions[i3] += Math.sin(now * 1.5 + i * 0.7) * 0.02;
      positions[i3 + 2] += Math.cos(now * 1.3 + i * 0.9) * 0.02;
    }

    // Keep particles centered around camera
    if (cameraPosition) {
      const dx = positions[i3] - cameraPosition.x;
      const dz = positions[i3 + 2] - cameraPosition.z;
      const halfSpread = PARTICLE_SPREAD / 2;
      if (dx > halfSpread) positions[i3] -= PARTICLE_SPREAD;
      if (dx < -halfSpread) positions[i3] += PARTICLE_SPREAD;
      if (dz > halfSpread) positions[i3 + 2] -= PARTICLE_SPREAD;
      if (dz < -halfSpread) positions[i3 + 2] += PARTICLE_SPREAD;
    }

    // Vertical wrap
    if ((particleType === 'embers' || particleType === 'magic') && positions[i3 + 1] > 35) {
      positions[i3 + 1] = 0;
    } else if ((particleType === 'snow' || particleType === 'ash') && positions[i3 + 1] < -1) {
      positions[i3 + 1] = 30;
    } else if (positions[i3 + 1] > 35 || positions[i3 + 1] < -1) {
      positions[i3 + 1] = Math.random() * 30;
    }
  }

  posAttr.needsUpdate = true;

  // Animate star twinkle
  if (starField?.visible) {
    starField.rotation.y += delta * 0.002;
  }
}

export function disposeParticles(scene) {
  if (particleSystem) {
    scene.remove(particleSystem);
    particleSystem.geometry.dispose();
    particleSystem.material.dispose();
    particleSystem = null;
    particleVelocities = null;
  }
}

export function selectParticleType(floorType, environment) {
  if (floorType === 'lava') return 'embers';

  if (environment?.skyColor) {
    const sky = new THREE.Color(environment.skyColor);
    if (sky.b > 0.4 && sky.r < 0.3 && sky.g < 0.3) return 'snow';
    if (sky.r > 0.3 && sky.b < 0.15) return 'embers';
  }

  if (environment?.skyPreset) {
    const PRESET_PARTICLES = {
      aurora: 'magic',
      void: 'magic',
      storm: 'ash',
      sunset: 'fireflies',
    };
    return PRESET_PARTICLES[environment.skyPreset] ?? 'dust';
  }

  return 'dust';
}
