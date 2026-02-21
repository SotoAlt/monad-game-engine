/**
 * ProceduralTextures — Canvas-based texture + normal map generators
 *
 * Each returns a cached CanvasTexture (256x256, tiled).
 * Normal maps add surface depth without extra geometry.
 * Auto-assigned per entity type / material theme in ToonMaterials.
 */

import * as THREE from 'three/webgpu';

const SIZE = 256;
const textureCache = new Map();

function setTiling(tex) {
  if (tex) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
}

function getCached(key, generator) {
  if (textureCache.has(key)) return textureCache.get(key);
  const result = generator();
  if (result instanceof THREE.Texture) {
    setTiling(result);
  } else {
    setTiling(result.map);
    setTiling(result.normalMap);
  }
  textureCache.set(key, result);
  return result;
}

// ─── Helpers ────────────────────────────────────────────────
function createCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  return canvas;
}

function noise2D(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y, scale) {
  const sx = x / scale, sy = y / scale;
  const ix = Math.floor(sx), iy = Math.floor(sy);
  const fx = sx - ix, fy = sy - iy;
  const a = noise2D(ix, iy), b = noise2D(ix + 1, iy);
  const c = noise2D(ix, iy + 1), d = noise2D(ix + 1, iy + 1);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbmNoise(x, y, octaves = 4, scale = 64) {
  let val = 0, amp = 0.5, s = scale;
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x, y, s) * amp;
    s /= 2; amp /= 2;
  }
  return val;
}

// Encode normal (nx, ny, nz) -> RGB pixel data
function encodeNormal(data, idx, nx, ny, nz) {
  data[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
  data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
  data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
  data[idx + 3] = 255;
}

// ─── Normal Map Generators ──────────────────────────────────

export function generateNormalMap(type) {
  const key = `normal_${type}`;
  return getCached(key, () => {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(SIZE, SIZE);
    const d = imgData.data;

    switch (type) {
      case 'stone': {
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          const n = fbmNoise(x, y, 4, 32);
          const dx = fbmNoise(x + 1, y, 4, 32) - n;
          const dy = fbmNoise(x, y + 1, 4, 32) - n;
          const strength = 3.0;
          encodeNormal(d, i, -dx * strength, -dy * strength, 1);
        }
        break;
      }
      case 'wood': {
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          const grain = Math.sin(y * 0.3 + smoothNoise(x, y, 16) * 4) * 0.5 + 0.5;
          const dx = Math.cos(y * 0.3 + smoothNoise(x + 1, y, 16) * 4) * 0.1;
          encodeNormal(d, i, dx * 2, -0.05 * grain, 1);
        }
        break;
      }
      case 'metal': {
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          const gridX = (x % 32 < 2 || x % 32 > 30) ? 1 : 0;
          const gridY = (y % 32 < 2 || y % 32 > 30) ? 1 : 0;
          const edge = Math.max(gridX, gridY);
          const micro = (noise2D(x * 3, y * 3) - 0.5) * 0.15;
          encodeNormal(d, i, edge * 0.3 + micro, edge * 0.3 + micro, 1);
        }
        break;
      }
      case 'crystal': {
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          // Voronoi-ish facets
          let minD = 999;
          let nearX = 0, nearY = 0;
          for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) {
            const cellX = Math.floor(x / 64) + cx, cellY = Math.floor(y / 64) + cy;
            const px = (cellX + noise2D(cellX * 7, cellY * 11)) * 64;
            const py = (cellY + noise2D(cellX * 13, cellY * 7)) * 64;
            const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
            if (dist < minD) { minD = dist; nearX = px; nearY = py; }
          }
          const nx = (x - nearX) / (minD + 1) * 0.5;
          const ny = (y - nearY) / (minD + 1) * 0.5;
          encodeNormal(d, i, nx, ny, 1);
        }
        break;
      }
      case 'hex': {
        const r = 32;
        const h = r * Math.sqrt(3) / 2;
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          // Find nearest hex center
          const row = Math.round(y / (h * 2));
          const xOff = row % 2 ? r * 1.5 : 0;
          const col = Math.round((x - xOff) / (r * 3));
          const cx = col * r * 3 + xOff;
          const cy = row * h * 2;
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          const edge = dist > r * 0.75 ? (dist - r * 0.75) / (r * 0.25) : 0;
          const bevel = Math.min(edge, 1) * 0.6;
          const dx = (x - cx) / (dist + 0.1) * bevel;
          const dy = (y - cy) / (dist + 0.1) * bevel;
          encodeNormal(d, i, dx, dy, 1);
        }
        break;
      }
      default: {
        // Flat normal map
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          encodeNormal(d, (y * SIZE + x) * 4, 0, 0, 1);
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.type = THREE.UnsignedByteType;
    return tex;
  });
}

// ─── Color Texture Generators ───────────────────────────────

export function stoneBrickTexture(color1 = '#4a6a8a', color2 = '#3a5a7a') {
  const key = `stonebrick_${color1}_${color2}`;
  return getCached(key, () => {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    const c1 = new THREE.Color(color1);
    const c2 = new THREE.Color(color2);

    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Draw bricks with mortar gaps and color variation
    const brickH = 32, brickW = 64, mortar = 3;
    for (let row = 0; row < SIZE / brickH + 1; row++) {
      const offsetX = row % 2 ? brickW / 2 : 0;
      for (let col = -1; col < SIZE / brickW + 1; col++) {
        const x = col * brickW + offsetX;
        const y = row * brickH;
        const variation = 0.85 + noise2D(col + row * 7, row) * 0.3;
        const bc = (col + row) % 2 === 0 ? c1 : c2;
        const r = Math.round(bc.r * variation * 255);
        const g = Math.round(bc.g * variation * 255);
        const b = Math.round(bc.b * variation * 255);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + mortar, y + mortar, brickW - mortar * 2, brickH - mortar * 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.repeat.set(2, 2);
    return tex;
  });
}

export function conveyorTexture(color = '#e67e22', darkColor = '#b35a00') {
  const key = `conveyor_${color}_${darkColor}`;
  return getCached(key, () => {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');

    // Metallic base
    ctx.fillStyle = '#555';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Chevron stripes
    const stripeW = SIZE / 8;
    for (let i = 0; i < 12; i++) {
      const y = i * stripeW - stripeW;
      ctx.fillStyle = i % 2 === 0 ? color : darkColor;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SIZE / 2, y + stripeW * 0.5);
      ctx.lineTo(SIZE, y);
      ctx.lineTo(SIZE, y + stripeW);
      ctx.lineTo(SIZE / 2, y + stripeW * 1.5);
      ctx.lineTo(0, y + stripeW);
      ctx.closePath();
      ctx.fill();
    }

    // Wear marks
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = '#000';
      const wx = Math.random() * SIZE;
      const wy = Math.random() * SIZE;
      ctx.fillRect(wx, wy, Math.random() * 30 + 5, 2);
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.repeat.set(1, 1);
    return tex;
  });
}

export function crystalFacetTexture(color = '#e67e22') {
  const key = `crystalfacet_${color}`;
  return getCached(key, () => {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    const base = new THREE.Color(color);

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Hex facets with inner gradient glow
    const r = SIZE / 4;
    const h = r * Math.sqrt(3) / 2;
    for (let row = -1; row < 5; row++) {
      for (let col = -1; col < 5; col++) {
        const cx = col * r * 1.5;
        const cy = row * h * 2 + (col % 2 ? h : 0);

        // Inner glow gradient
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.8);
        const bright = base.clone().offsetHSL(0, 0.1, 0.15);
        grad.addColorStop(0, '#' + bright.getHexString());
        grad.addColorStop(0.7, color);
        grad.addColorStop(1, '#' + base.clone().multiplyScalar(0.7).getHexString());
        ctx.fillStyle = grad;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const px = cx + r * 0.85 * Math.cos(angle);
          const py = cy + r * 0.85 * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // Hex outline
        ctx.strokeStyle = '#' + base.clone().multiplyScalar(0.5).getHexString() + '80';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    return new THREE.CanvasTexture(canvas);
  });
}

export function sparkleTexture(color = '#f1c40f') {
  const key = `sparkle_${color}`;
  return getCached(key, () => {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    const base = new THREE.Color(color);

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Starburst pattern
    const spacing = SIZE / 6;
    for (let x = spacing / 2; x < SIZE; x += spacing) {
      for (let y = spacing / 2; y < SIZE; y += spacing) {
        const bright = base.clone().offsetHSL(0, -0.1, 0.3);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, spacing * 0.4);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.2, '#' + bright.getHexString());
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.fillRect(x - spacing / 2, y - spacing / 2, spacing, spacing);

        // Cross sparkle
        ctx.strokeStyle = '#ffffff60';
        ctx.lineWidth = 1;
        const arm = spacing * 0.3;
        ctx.beginPath();
        ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y);
        ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm);
        ctx.stroke();
      }
    }

    return new THREE.CanvasTexture(canvas);
  });
}

export function mossTexture(color = '#27ae60', variance = 40) {
  const key = `moss_${color}_${variance}`;
  return getCached(key, () => {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    const base = new THREE.Color(color);

    // Fill base
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Noise layer with cluster variation
    const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
    const d = imgData.data;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const n = fbmNoise(x, y, 3, 48);
      const cluster = fbmNoise(x + 100, y + 100, 2, 96) > 0.5 ? 1.2 : 0.85;
      const v = (n - 0.5) * variance * cluster;
      d[i]     = Math.max(0, Math.min(255, d[i] + v * 0.5));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v * 0.3));
    }
    ctx.putImageData(imgData, 0, 0);

    return new THREE.CanvasTexture(canvas);
  });
}

// Legacy aliases — redirect to new texture generators
export function checkerTexture(color1 = '#4a90d9', color2 = '#3a7bc8') {
  return stoneBrickTexture(color1, color2);
}

export function stripeTexture(color = '#e67e22', darkColor = '#d35400') {
  return conveyorTexture(color, darkColor);
}

export function hexTexture(color = '#e67e22') {
  return crystalFacetTexture(color);
}

export function noiseTexture(color = '#95a5a6', variance = 30) {
  return mossTexture(color, variance);
}

export function dotTexture(color = '#f1c40f') {
  return sparkleTexture(color);
}

// ─── Texture Assignment ─────────────────────────────────────

export function getProceduralTexture(entity) {
  const props = entity.properties || {};
  const type = entity.type;

  if (props.isIce) return null;
  if (type === 'obstacle' || type === 'collectible') return null;

  if (props.isConveyor) {
    return conveyorTexture(props.color || '#e67e22');
  }

  if (props.breakable) {
    return crystalFacetTexture(props.color || '#e67e22');
  }

  if (type === 'platform' || type === 'ramp') {
    const c = props.color || '#3498db';
    const base = new THREE.Color(c);
    const dark = base.clone().multiplyScalar(0.85);
    return stoneBrickTexture(c, '#' + dark.getHexString());
  }

  if (type === 'trigger' && props.isGoal) {
    return sparkleTexture(props.color || '#f1c40f');
  }

  if (type === 'decoration') {
    return mossTexture(props.color || '#95a5a6');
  }

  return null;
}

// Get matching normal map type for an entity
export function getNormalMapType(entity, materialTheme) {
  const props = entity.properties || {};
  const type = entity.type;

  if (props.isIce) return 'crystal';
  if (props.breakable) return 'hex';
  if (props.isConveyor) return 'metal';
  if (type === 'collectible') return 'crystal';
  if (type === 'obstacle') return 'metal';

  // Theme-based normal maps
  if (materialTheme) {
    const themeNormals = {
      stone: 'stone', lava_rock: 'stone', wood: 'wood',
      ice_crystal: 'crystal', neon: null, candy: null,
    };
    return themeNormals[materialTheme] ?? 'stone';
  }

  if (type === 'platform' || type === 'ramp') return 'stone';
  if (type === 'decoration') return 'stone';
  return null;
}
