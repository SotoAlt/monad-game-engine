/**
 * Scene setup — Three.js scene, camera, renderer, lighting, and ground plane.
 */

import * as THREE from 'three/webgpu';
import { createGroundToonMaterial } from './ToonMaterials.js';
import { createSkyDome } from './EnvironmentEffects.js';
import { initPostProcessing } from './PostProcessing.js';
import { initScreenEffects } from './vfx/ScreenEffects.js';
import { urlParams } from './config.js';

const BG_COLOR = 0x2a2a4e;
const WORLD_SIZE = 200;

export async function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG_COLOR);
  scene.fog = new THREE.FogExp2(BG_COLOR, 0.012);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 10, 30);

  const forceWebGL = urlParams.get('forceWebGL') === 'true';
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
  await renderer.init();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('game').appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0x8090a0, 0.8);
  scene.add(ambientLight);
  scene.add(new THREE.HemisphereLight(0xb0d0ff, 0x404030, 0.6));

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(50, 100, 50);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  scene.add(directionalLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 50, 50),
    createGroundToonMaterial()
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const gridHelper = new THREE.GridHelper(WORLD_SIZE, 50, 0x555555, 0x444444);
  scene.add(gridHelper);

  createSkyDome(scene);
  initPostProcessing(renderer, scene, camera, directionalLight);
  initScreenEffects(scene);

  return { scene, camera, renderer, ground, gridHelper, ambientLight, directionalLight };
}
