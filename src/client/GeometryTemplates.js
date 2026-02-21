/**
 * Geometry Templates — Named shape profiles for the compose system
 *
 * The agent writes "shape": "horn" and the client generates a curved
 * LatheGeometry. Each template is parameterized by (sx, sy, sz) for scaling.
 *
 * Categories:
 *   Lathe-based  — 2D profile rotated around Y axis
 *   Extrude-based — 2D path extruded into 3D
 *   Tube-based   — 3D curve with tube radius
 */

import * as THREE from 'three/webgpu';

const SEGMENTS = 16;

function lathe(points, sx, sy, sz) {
  const pts = points.map(([r, h]) => new THREE.Vector2(r * sx, h * sy));
  const geo = new THREE.LatheGeometry(pts, SEGMENTS);
  if (Math.abs(sz / sx - 1) > 0.05) {
    geo.scale(1, 1, sz / sx);
  }
  return geo;
}

function extrude(shape, sx, sy, sz) {
  const settings = { depth: sz * 0.5, bevelEnabled: false };
  const geo = new THREE.ExtrudeGeometry(shape, settings);
  geo.scale(sx * 0.8, sy * 0.8, 1);
  geo.translate(0, 0, -sz * 0.25);
  return geo;
}

function tube(curve, sx, sy, sz, radiusScale = 0.3) {
  const radius = Math.min(sx, sz) * radiusScale;
  return new THREE.TubeGeometry(curve, 32, radius, 8, false);
}

export const GEOMETRY_TEMPLATES = {
  // ============================================
  // Lathe-based (profile rotated around Y)
  // ============================================

  column: (sx, sy, sz) => lathe([
    [0.9, 0], [1, 0.05], [0.7, 0.1], [0.65, 0.5], [0.7, 0.9], [1, 0.95], [0.9, 1],
  ], sx, sy, sz),

  vase: (sx, sy, sz) => lathe([
    [0, 0], [0.7, 0], [0.8, 0.1], [0.5, 0.3], [0.3, 0.5],
    [0.4, 0.7], [0.6, 0.85], [0.55, 0.95], [0.4, 1], [0, 1],
  ], sx, sy, sz),

  teardrop: (sx, sy, sz) => lathe([
    [0, 0], [0.8, 0.1], [1, 0.3], [0.9, 0.5],
    [0.6, 0.7], [0.3, 0.85], [0.05, 0.98], [0, 1],
  ], sx, sy, sz),

  mushroom_cap: (sx, sy, sz) => lathe([
    [0, 0], [0.15, 0], [0.15, 0.3], [0.4, 0.35],
    [0.8, 0.5], [1, 0.7], [0.9, 0.9], [0.5, 1], [0, 1],
  ], sx, sy, sz),

  horn: (sx, sy, sz) => lathe([
    [0, 0], [0.05, 0.1], [0.15, 0.3], [0.3, 0.5],
    [0.5, 0.65], [0.7, 0.75], [0.9, 0.85], [1, 0.95], [0.9, 1],
  ], sx, sy, sz),

  flask: (sx, sy, sz) => lathe([
    [0, 0], [0.3, 0], [0.35, 0.05], [0.3, 0.3], [0.25, 0.35],
    [0.8, 0.5], [1, 0.6], [0.9, 0.75], [0.5, 0.9], [0, 1],
  ], sx, sy, sz),

  bell: (sx, sy, sz) => lathe([
    [1, 0], [0.95, 0.05], [0.8, 0.2], [0.6, 0.4],
    [0.4, 0.6], [0.25, 0.75], [0.15, 0.9], [0.1, 1], [0, 1],
  ], sx, sy, sz),

  dome: (sx, sy, sz) => {
    const geo = new THREE.SphereGeometry(
      Math.max(sx, sz) * 0.5, SEGMENTS, SEGMENTS,
      0, Math.PI * 2, 0, Math.PI * 0.5
    );
    geo.scale(1, sy / Math.max(sx, sz), sz / Math.max(sx, sz));
    return geo;
  },

  // ============================================
  // Extrude-based (2D shape → 3D depth)
  // ============================================

  wing: (sx, sy, sz) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(2, 0.8);
    shape.lineTo(2, 1);
    shape.lineTo(0.5, 0.6);
    shape.lineTo(0, 0.3);
    shape.closePath();
    return extrude(shape, sx, sy, sz);
  },

  star: (sx, sy, sz) => {
    const shape = new THREE.Shape();
    const outerR = 1, innerR = 0.4;
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return extrude(shape, sx, sy, sz);
  },

  heart: (sx, sy, sz) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.5);
    shape.bezierCurveTo(0.5, -1, 1.2, -0.5, 0.8, 0.2);
    shape.bezierCurveTo(0.5, 0.6, 0, 1, 0, 1);
    shape.bezierCurveTo(0, 1, -0.5, 0.6, -0.8, 0.2);
    shape.bezierCurveTo(-1.2, -0.5, -0.5, -1, 0, -0.5);
    return extrude(shape, sx, sy, sz);
  },

  arrow: (sx, sy, sz) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 1);
    shape.lineTo(0.6, 0.4);
    shape.lineTo(0.25, 0.4);
    shape.lineTo(0.25, -1);
    shape.lineTo(-0.25, -1);
    shape.lineTo(-0.25, 0.4);
    shape.lineTo(-0.6, 0.4);
    shape.closePath();
    return extrude(shape, sx, sy, sz);
  },

  cross: (sx, sy, sz) => {
    const w = 0.3;
    const shape = new THREE.Shape();
    shape.moveTo(-w, 1);
    shape.lineTo(w, 1);
    shape.lineTo(w, w);
    shape.lineTo(1, w);
    shape.lineTo(1, -w);
    shape.lineTo(w, -w);
    shape.lineTo(w, -1);
    shape.lineTo(-w, -1);
    shape.lineTo(-w, -w);
    shape.lineTo(-1, -w);
    shape.lineTo(-1, w);
    shape.lineTo(-w, w);
    shape.closePath();
    return extrude(shape, sx, sy, sz);
  },

  // ============================================
  // Tube-based (3D curve with tube radius)
  // ============================================

  tentacle: (sx, sy, sz) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(sx * 0.1, sy * 0.25, sz * 0.05),
      new THREE.Vector3(sx * 0.2, sy * 0.5, -sz * 0.1),
      new THREE.Vector3(sx * 0.05, sy * 0.75, sz * 0.1),
      new THREE.Vector3(-sx * 0.1, sy * 1, 0),
    ]);
    return tube(curve, sx, sy, sz, 0.2);
  },

  arch: (sx, sy, sz) => {
    const points = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const angle = Math.PI * t;
      points.push(new THREE.Vector3(
        Math.cos(angle) * sx * 0.5,
        Math.sin(angle) * sy * 0.5,
        0
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return tube(curve, sx, sy, sz, 0.15);
  },

  s_curve: (sx, sy, sz) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-sx * 0.5, 0, 0),
      new THREE.Vector3(-sx * 0.2, sy * 0.3, sz * 0.2),
      new THREE.Vector3(sx * 0.2, sy * 0.7, -sz * 0.2),
      new THREE.Vector3(sx * 0.5, sy * 1, 0),
    ]);
    return tube(curve, sx, sy, sz, 0.15);
  },
};

/** All template names for validation */
export const TEMPLATE_SHAPE_NAMES = Object.keys(GEOMETRY_TEMPLATES);
