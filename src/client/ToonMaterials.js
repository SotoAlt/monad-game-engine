/**
 * ToonMaterials — Cel-shaded material factory with theme support
 *
 * Material themes give each arena a distinct look:
 *   stone, lava_rock, ice_crystal, neon, wood, candy
 *
 * Normal maps from ProceduralTextures add surface depth.
 *
 * Material caching: non-animated entity types (platform, ramp, collectible,
 * non-goal triggers) share materials. Animated types (obstacle, decoration,
 * goal triggers, wind) get fresh materials since their emissiveIntensity is
 * mutated per-frame.
 */

import * as THREE from 'three/webgpu';
import { getProceduralTexture, generateNormalMap, getNormalMapType } from './ProceduralTextures.js';

function createGradientTexture(steps) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    data[i] = Math.round((i / (steps - 1)) * 255);
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const GRADIENT_2 = createGradientTexture(2);
const GRADIENT_3 = createGradientTexture(3);
const GRADIENT_4 = createGradientTexture(4);

const GRADIENT_MAP = {
  platform: GRADIENT_3,
  ramp: GRADIENT_3,
  collectible: GRADIENT_2,
  obstacle: GRADIENT_2,
  trigger: GRADIENT_3,
  decoration: GRADIENT_4,
};

// ─── Material Themes ────────────────────────────────────────
const MATERIAL_THEMES = {
  stone: {
    emissiveMult: 0.1,
    surfaceEmissive: 0.3,
    colorShift: [0, 0, 0],        // H, S, L offsets
    normalScale: 0.6,
  },
  lava_rock: {
    emissiveMult: 0.3,
    surfaceEmissive: 0.4,
    colorShift: [0, 0.05, -0.05],
    normalScale: 0.8,
  },
  ice_crystal: {
    emissiveMult: 0.15,
    surfaceEmissive: 0.25,
    colorShift: [0, -0.1, 0.1],
    normalScale: 0.5,
  },
  neon: {
    emissiveMult: 0.5,
    surfaceEmissive: 0.6,
    colorShift: [0, 0.15, 0.05],
    normalScale: 0,
  },
  wood: {
    emissiveMult: 0.08,
    surfaceEmissive: 0.2,
    colorShift: [0, -0.05, -0.03],
    normalScale: 0.7,
  },
  candy: {
    emissiveMult: 0.25,
    surfaceEmissive: 0.35,
    colorShift: [0, 0.1, 0.08],
    normalScale: 0,
  },
};

let currentMaterialTheme = null;

export function setMaterialTheme(themeName) {
  currentMaterialTheme = themeName && MATERIAL_THEMES[themeName] ? themeName : null;
}

export function getMaterialTheme() {
  return currentMaterialTheme;
}

// ─── Material Cache ─────────────────────────────────────────
const _materialCache = new Map();

function _shouldCacheMaterial(entity) {
  const { type, properties: props = {} } = entity;
  // Animated types mutate emissiveIntensity per-frame — must not share materials
  if (type === 'obstacle') return false;
  if (type === 'decoration') return false;
  if (type === 'trigger' && props.isGoal) return false;
  if (props.isWind) return false;
  if (props.isIce) return false;
  return true;
}

function _getMaterialCacheKey(entity) {
  const props = entity.properties || {};
  const color = props.color || '';
  const flags = [
    props.isConveyor ? 'conv' : '',
    props.emissive ? 'em' : '',
    props.opacity != null ? `op${props.opacity}` : '',
  ].filter(Boolean).join(',');
  return `${entity.type}|${color}|${currentMaterialTheme || ''}|${flags}`;
}

// ─── Entity Material Factory ────────────────────────────────
function _createEntityToonMaterialUncached(entity) {
  const props = entity.properties || {};
  const type = entity.type;

  // Ice: keep physical material for reflective look
  if (props.isIce) {
    return new THREE.MeshPhysicalMaterial({
      color: '#b3e5fc',
      roughness: 0.05,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.85,
      emissive: '#b3e5fc',
      emissiveIntensity: 0.1,
    });
  }

  const color = getEntityColor(type, props.color);
  const isSurface = type === 'platform' || type === 'ramp';
  const theme = currentMaterialTheme ? MATERIAL_THEMES[currentMaterialTheme] : null;

  if (theme?.colorShift) {
    const [dh, ds, dl] = theme.colorShift;
    color.offsetHSL(dh, ds, dl);
  }

  // Nudge surfaces whose luminance is too close to the ground (~0.24) for visibility
  if (isSurface && !props.emissive) {
    const lum = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
    if (Math.abs(lum - 0.24) < 0.18) {
      color.offsetHSL(0, 0.1, 0.15);
    }
  }

  const isTransparent = props.opacity != null && props.opacity < 1;
  const gradientMap = GRADIENT_MAP[type] || GRADIENT_3;

  let emissiveIntensity = theme ? theme.emissiveMult : 0.12;
  if (props.emissive) emissiveIntensity = 0.7;
  else if (isSurface) emissiveIntensity = theme ? theme.surfaceEmissive : 0.35;

  const matOpts = {
    color,
    gradientMap,
    emissive: color,
    emissiveIntensity,
    transparent: isTransparent,
    opacity: props.opacity ?? 1,
    depthWrite: !isTransparent,
  };

  if (props.isConveyor) {
    matOpts.emissive = new THREE.Color('#e67e22');
    matOpts.emissiveIntensity = 0.25;
  }

  const material = new THREE.MeshToonMaterial(matOpts);

  const texture = getProceduralTexture(entity);
  if (texture) {
    material.map = texture;
  }

  const normalType = getNormalMapType(entity, currentMaterialTheme);
  const normalScale = theme ? theme.normalScale : 0.5;
  if (normalType && normalScale > 0) {
    material.normalMap = generateNormalMap(normalType);
    material.normalScale = new THREE.Vector2(normalScale, normalScale);
  }

  return material;
}

export function createEntityToonMaterial(entity) {
  if (!_shouldCacheMaterial(entity)) {
    return _createEntityToonMaterialUncached(entity);
  }
  const key = _getMaterialCacheKey(entity);
  let mat = _materialCache.get(key);
  if (!mat) {
    mat = _createEntityToonMaterialUncached(entity);
    _materialCache.set(key, mat);
  }
  return mat;
}

export function clearMaterialCache() {
  for (const mat of _materialCache.values()) mat.dispose();
  _materialCache.clear();
}

export function createInstancedPlatformMaterial() {
  const theme = currentMaterialTheme ? MATERIAL_THEMES[currentMaterialTheme] : null;
  const emissiveIntensity = theme ? theme.surfaceEmissive : 0.35;

  const material = new THREE.MeshToonMaterial({
    color: 0xffffff,
    gradientMap: GRADIENT_3,
    emissive: 0x888888,
    emissiveIntensity,
  });

  const normalScale = theme ? theme.normalScale : 0.5;
  if (normalScale > 0) {
    const normalType = getNormalMapType({ type: 'platform', properties: {} }, currentMaterialTheme);
    if (normalType) {
      material.normalMap = generateNormalMap(normalType);
      material.normalScale = new THREE.Vector2(normalScale, normalScale);
    }
  }

  return material;
}

export function createPlayerToonMaterial(color) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: GRADIENT_3,
    emissive: color,
    emissiveIntensity: 0.3,
  });
}

export function createGroundToonMaterial() {
  const mat = new THREE.MeshToonMaterial({
    color: 0x2d3436,
    gradientMap: GRADIENT_4,
    emissive: 0x2d3436,
    emissiveIntensity: 0.15,
  });

  mat.normalMap = generateNormalMap('stone');
  mat.normalScale = new THREE.Vector2(0.3, 0.3);

  return mat;
}

const ENTITY_COLORS = {
  platform: 0x3498db,
  ramp: 0x2ecc71,
  collectible: 0xf1c40f,
  obstacle: 0xe74c3c,
  trigger: 0x9b59b6,
  decoration: 0x95a5a6,
};

export function getEntityColor(type, customColor) {
  if (customColor) return new THREE.Color(customColor);
  return new THREE.Color(ENTITY_COLORS[type] || 0x95a5a6);
}
