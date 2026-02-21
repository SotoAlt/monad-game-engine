/**
 * Shared particle helpers for WebGPU SpriteNodeMaterial particles.
 * Provides soft-circle opacity node (no texture needed).
 */

import * as THREE from 'three/webgpu';
import { uv, smoothstep, float, color as colorNode, instancedBufferAttribute } from 'three/tsl';

/**
 * TSL node: soft radial circle falloff (1.0 at center, 0.0 at edge).
 */
export function softCircle() {
  const dist = uv().sub(0.5).length().mul(2.0);
  return smoothstep(float(1.0), float(0.0), dist);
}

/**
 * Create a SpriteNodeMaterial configured for particles.
 * Position is driven by the given InstancedBufferAttribute.
 */
export function createParticleMaterial(posAttr, { color, size, opacity, blending }) {
  const material = new THREE.SpriteNodeMaterial();
  material.positionNode = instancedBufferAttribute(posAttr);
  material.scaleNode = float(size);
  material.colorNode = colorNode(color);
  material.opacityNode = softCircle().mul(float(opacity));
  material.transparent = true;
  material.depthWrite = false;
  material.blending = blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending;
  return material;
}
