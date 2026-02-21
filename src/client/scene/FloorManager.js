/**
 * Floor and environment management — lava floor, hazard plane, environment settings.
 */

import * as THREE from 'three/webgpu';
import { floor, hazardPlaneState } from '../state.js';
import { createLavaShaderMaterial, createWaterShaderMaterial } from '../SurfaceShaders.js';
import { updateSkyColors, initParticles, selectParticleType } from '../EnvironmentEffects.js';
import { setMaterialTheme } from '../ToonMaterials.js';

let _scene, _ground, _gridHelper, _ambientLight, _directionalLight;
let lavaFloor, hazardPlaneMesh, hazardPlaneMat;

export function initFloorManager({ scene, ground, gridHelper, ambientLight, directionalLight }) {
  _scene = scene;
  _ground = ground;
  _gridHelper = gridHelper;
  _ambientLight = ambientLight;
  _directionalLight = directionalLight;

  const lavaGeometry = new THREE.PlaneGeometry(200, 200, 40, 40);
  const lavaMaterial = createLavaShaderMaterial();
  lavaFloor = new THREE.Mesh(lavaGeometry, lavaMaterial);
  lavaFloor.rotation.x = -Math.PI / 2;
  lavaFloor.position.y = -0.5;
  lavaFloor.visible = false;
  scene.add(lavaFloor);

  const hazardPlaneGeom = new THREE.PlaneGeometry(400, 400, 40, 40);
  hazardPlaneMat = createLavaShaderMaterial();
  hazardPlaneMesh = new THREE.Mesh(hazardPlaneGeom, hazardPlaneMat);
  hazardPlaneMesh.rotation.x = -Math.PI / 2;
  hazardPlaneMesh.visible = false;
  scene.add(hazardPlaneMesh);
}

export function updateHazardPlaneMaterial(type) {
  const newMat = type === 'water' ? createWaterShaderMaterial() : createLavaShaderMaterial();
  hazardPlaneMesh.material = newMat;
  hazardPlaneMat = newMat;
}

export function setFloorType(type) {
  floor.currentType = type;
  _ground.visible = type === 'solid';
  _gridHelper.visible = type === 'solid';
  lavaFloor.visible = type === 'lava';

  const pType = selectParticleType(type, null);
  initParticles(_scene, pType);

  console.log(`[Floor] Type changed to: ${type}`);
}

export function applyEnvironment(env) {
  if (env.skyColor) {
    _scene.background = new THREE.Color(env.skyColor);
    updateSkyColors(env.skyColor, env.fogColor || env.skyColor, env.skyPreset);
  }
  if (env.fogColor || env.fogDensity != null) {
    _scene.fog = new THREE.FogExp2(
      env.fogColor ? new THREE.Color(env.fogColor) : _scene.fog.color,
      env.fogDensity ?? 0.012
    );
  }
  if (env.ambientColor) _ambientLight.color.set(env.ambientColor);
  if (env.ambientIntensity != null) _ambientLight.intensity = env.ambientIntensity;
  if (env.sunColor) _directionalLight.color.set(env.sunColor);
  if (env.sunIntensity != null) _directionalLight.intensity = env.sunIntensity;
  if (env.sunPosition) _directionalLight.position.set(...env.sunPosition);

  if (env.materialTheme !== undefined) setMaterialTheme(env.materialTheme);

  const pType = selectParticleType(floor.currentType, env);
  initParticles(_scene, pType);

  console.log('[Environment] Updated');
}

export function getHazardPlaneMesh() { return hazardPlaneMesh; }
export function getLavaFloor() { return lavaFloor; }

export function animateFloors(time) {
  if (lavaFloor.visible) {
    lavaFloor.position.y = -0.5 + Math.sin(time * 1.0) * 0.1;
  }
  if (hazardPlaneMesh.visible) {
    hazardPlaneMesh.position.y = hazardPlaneState.height + Math.sin(time * 1.5) * 0.15;
  }
}
