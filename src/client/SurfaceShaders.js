/**
 * SurfaceShaders — TSL NodeMaterial shaders for lava, water, and wind
 *
 * Uses Three.js TSL (Three Shading Language) with auto-updating `time` node.
 * No manual time uniform updates needed — TSL handles it.
 */

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4,
  uv, positionLocal, time,
  sin, cos, floor, fract, dot, mix, smoothstep,
  uniform, normalView, positionViewDirection,
  max, pow, abs, oneMinus
} from 'three/tsl';

// ─── Shared Noise (TSL) ────────────────────────────────────

const hash2d = Fn(([p_immutable]) => {
  const p = vec2(p_immutable).toVar();
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123));
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

// ─── Lava ───────────────────────────────────────────────────

export function createLavaShaderMaterial() {
  const material = new THREE.NodeMaterial();
  material.transparent = true;
  material.side = THREE.DoubleSide;

  // Vertex: displacement via noise
  const pos = positionLocal.toVar();
  const n = noise2d(pos.xz.mul(0.3).add(time.mul(0.4))).mul(0.4)
    .add(noise2d(pos.xz.mul(0.7).sub(time.mul(0.3))).mul(0.2));
  material.positionNode = pos.add(vec3(0, n, 0));

  // Fragment: color ramp
  const uvScaled = uv().mul(6.0);
  const n1 = noise2d(uvScaled.add(time.mul(0.3)));
  const n2 = noise2d(uvScaled.mul(2.0).sub(time.mul(0.5)));
  const combined = n1.mul(0.6).add(n2.mul(0.4));

  const darkRed = vec3(0.5, 0.05, 0.0);
  const orange = vec3(0.9, 0.3, 0.0);
  const yellow = vec3(1.0, 0.8, 0.2);
  let color = mix(darkRed, orange, smoothstep(0.2, 0.5, combined));
  color = mix(color, yellow, smoothstep(0.6, 0.85, combined));

  // Bright crack lines
  const crack = smoothstep(0.78, 0.82, combined);
  color = color.add(vec3(1.0, 0.9, 0.4).mul(crack).mul(0.8));

  // Pulsing glow
  color = color.mul(float(0.9).add(sin(time.mul(2.0)).mul(0.1)));

  material.colorNode = color;
  material.opacityNode = float(0.9);

  return material;
}

// ─── Water ──────────────────────────────────────────────────

export function createWaterShaderMaterial() {
  const material = new THREE.NodeMaterial();
  material.transparent = true;
  material.side = THREE.DoubleSide;

  // Vertex: multi-frequency sine waves
  const pos = positionLocal.toVar();
  const wave = sin(pos.x.mul(1.5).add(time.mul(2.0))).mul(0.15)
    .add(sin(pos.z.mul(2.0).sub(time.mul(1.5))).mul(0.1))
    .add(sin(pos.x.add(pos.z).mul(0.8).add(time)).mul(0.08));
  material.positionNode = pos.add(vec3(0, wave, 0));

  // Fragment: Fresnel + shimmer
  const fresnel = pow(oneMinus(max(dot(normalView, positionViewDirection), 0.0)), 2.0);

  const deepBlue = vec3(0.05, 0.15, 0.4);
  const surfaceTeal = vec3(0.1, 0.5, 0.6);
  const highlight = vec3(0.4, 0.8, 0.9);

  const uvCoord = uv();
  let color = mix(deepBlue, surfaceTeal, uvCoord.y.mul(0.5).add(0.5));

  // Shimmer
  const shimmer = sin(uvCoord.x.mul(20.0).add(time.mul(3.0))).mul(sin(uvCoord.y.mul(15.0).sub(time.mul(2.0))));
  color = color.add(highlight.mul(smoothstep(0.7, 1.0, shimmer)).mul(0.3));

  const alpha = mix(float(0.6), float(0.85), fresnel);

  material.colorNode = color;
  material.opacityNode = alpha;

  return material;
}

// ─── Wind ───────────────────────────────────────────────────

export function createWindShaderMaterial(windForce = [1, 0, 0]) {
  const material = new THREE.NodeMaterial();
  material.transparent = true;
  material.side = THREE.DoubleSide;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;

  const windDir = uniform(new THREE.Vector3(...windForce).normalize());

  // Fragment: scrolling dashes in wind direction
  const uvCoord = uv();
  const dir = windDir.xz.normalize();
  const projected = dot(uvCoord.sub(0.5), dir);
  const dashRaw = sin(projected.mul(15.0).sub(time.mul(4.0)).mul(3.14159)).mul(0.5).add(0.5);
  const dash = smoothstep(0.6, 0.8, dashRaw);

  // Fade at edges
  const edge = smoothstep(0.0, 0.15, uvCoord.x)
    .mul(smoothstep(1.0, 0.85, uvCoord.x))
    .mul(smoothstep(0.0, 0.15, uvCoord.y))
    .mul(smoothstep(1.0, 0.85, uvCoord.y));

  const windColor = vec3(0.6, 0.85, 1.0);
  const windAlpha = dash.mul(edge).mul(0.15);

  material.colorNode = windColor;
  material.opacityNode = windAlpha;

  return material;
}

// ─── Conveyor (CPU-based, unchanged) ────────────────────────

const conveyorMaterials = [];

export function registerConveyorMaterial(material, speed, direction) {
  conveyorMaterials.push({ material, speed, direction });
}

export function updateConveyorScrolls(delta) {
  for (const entry of conveyorMaterials) {
    if (entry.material.map) {
      const dir = entry.direction || [1, 0, 0];
      entry.material.map.offset.x += dir[0] * entry.speed * delta * 0.1;
      entry.material.map.offset.y += dir[2] * entry.speed * delta * 0.1;
    }
  }
}
