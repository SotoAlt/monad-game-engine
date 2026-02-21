/**
 * PostProcessing — RenderPipeline with toon outline, bloom, and FXAA
 *
 * 4 quality tiers with bidirectional FPS scaling:
 *   ultra:  all effects, pixelRatio 2.0, shadows 2048
 *   high:   outline + bloom + FXAA, pixelRatio 1.5, shadows 1024
 *   medium: FXAA only, pixelRatio 1.25, no shadows
 *   low:    no post-processing, pixelRatio 1.0, no shadows
 *
 * Degrade: <30fps for 3s → drop one tier
 * Recover: >55fps for 15s → raise one tier (capped by maxTier)
 */

import * as THREE from 'three/webgpu';
import { toonOutlinePass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';

const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];
const OUTLINE_COLOR = new THREE.Color(0x000000);

const TIER_CONFIG = {
  ultra:  { pixelRatio: 2.0,  shadowSize: 2048, outline: true,  bloom: true,  fxaa: true,  particleBudget: 20 },
  high:   { pixelRatio: 1.5,  shadowSize: 1024, outline: true,  bloom: true,  fxaa: true,  particleBudget: 15 },
  medium: { pixelRatio: 1.25, shadowSize: 0,    outline: false, bloom: false, fxaa: true,  particleBudget: 10 },
  low:    { pixelRatio: 1.0,  shadowSize: 0,    outline: false, bloom: false, fxaa: false, particleBudget: 5 },
};

let renderPipeline = null;
let currentTier = 'high';
let maxTier = 'ultra';
let _renderer = null;
let _scene = null;
let _camera = null;
let _directionalLight = null;

// FPS tracking for bidirectional scaling
let frameCount = 0;
let fpsCheckTime = 0;
let degradeSince = 0;
let stableAbove55Since = 0;
const FPS_CHECK_INTERVAL = 1000;

function detectInitialTier() {
  const cores = navigator.hardwareConcurrency || 2;
  const pixels = screen.width * screen.height;
  const mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768;

  if (mobile) {
    maxTier = 'medium';
    return cores >= 6 ? 'medium' : 'low';
  }

  if (cores >= 8 && pixels >= 2_000_000) return 'ultra';
  if (cores >= 6) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

// Build the full effects pipeline once — never rebuild at runtime.
// Rebuilding disposes GPU textures (shadow maps, render targets) while
// the GPU may still reference them, causing "Destroyed texture" crashes.
function buildPipelineOnce() {
  renderPipeline = new THREE.RenderPipeline(_renderer);

  const scenePass = toonOutlinePass(_scene, _camera, OUTLINE_COLOR, 0.003, 1.0);
  const scenePassColor = scenePass.getTextureNode('output');
  let outputNode = scenePassColor;
  outputNode = outputNode.add(bloom(scenePassColor, 0.15, 0.4, 0.55));
  outputNode = fxaa(outputNode);

  renderPipeline.outputNode = outputNode;
  renderPipeline.needsUpdate = true;
}

export function initPostProcessing(rendererRef, sceneRef, cameraRef, directionalLight) {
  _renderer = rendererRef;
  _scene = sceneRef;
  _camera = cameraRef;
  _directionalLight = directionalLight || null;

  currentTier = detectInitialTier();

  fpsCheckTime = performance.now();

  // Only build the pipeline if the device can handle effects
  const maxIdx = TIER_ORDER.indexOf(maxTier);
  if (maxIdx >= TIER_ORDER.indexOf('high')) {
    buildPipelineOnce();
  }
  applyShadowSettings(currentTier);

  console.log(`[PostProcess] Initial quality: ${currentTier} (max: ${maxTier})`);
}

export function renderFrame() {
  const cfg = TIER_CONFIG[currentTier];
  if (renderPipeline && (cfg.outline || cfg.bloom)) {
    renderPipeline.render();
  } else {
    _renderer.render(_scene, _camera);
  }

  frameCount++;
  const now = performance.now();
  if (now - fpsCheckTime > FPS_CHECK_INTERVAL) {
    const fps = (frameCount / (now - fpsCheckTime)) * 1000;
    frameCount = 0;
    fpsCheckTime = now;
    autoAdjustQuality(fps, now);
  }
}

function autoAdjustQuality(fps, now) {
  const tierIdx = TIER_ORDER.indexOf(currentTier);

  if (fps < 30) {
    if (degradeSince === 0) degradeSince = now;
    stableAbove55Since = 0;

    if (now - degradeSince >= 3000 && tierIdx > 0) {
      degradeSince = 0;
      applyTier(TIER_ORDER[tierIdx - 1]);
    }
  } else if (fps > 55) {
    if (stableAbove55Since === 0) stableAbove55Since = now;
    degradeSince = 0;

    const maxIdx = TIER_ORDER.indexOf(maxTier);
    if (now - stableAbove55Since >= 15000 && tierIdx < maxIdx) {
      stableAbove55Since = 0;
      applyTier(TIER_ORDER[tierIdx + 1]);
    }
  } else {
    degradeSince = 0;
    stableAbove55Since = 0;
  }
}

function applyTier(tier) {
  if (tier === currentTier) return;
  currentTier = tier;
  console.log(`[PostProcess] Quality: ${tier}`);

  _renderer.setPixelRatio(TIER_CONFIG[tier].pixelRatio);
  applyShadowSettings(tier);
}

// Only toggle castShadow — never dispose shadow maps at runtime.
// Disposing GPU textures while the pipeline still references them
// causes "Destroyed texture [ShadowDepthTexture]" WebGPU crashes.
function applyShadowSettings(tier) {
  if (_directionalLight) {
    _directionalLight.castShadow = TIER_CONFIG[tier].shadowSize > 0;
  }
}

export function getParticleBudget() {
  return TIER_CONFIG[currentTier].particleBudget;
}

export function getCurrentTier() {
  return currentTier;
}

export function setMaxTier(tier) {
  if (TIER_CONFIG[tier]) maxTier = tier;
}
