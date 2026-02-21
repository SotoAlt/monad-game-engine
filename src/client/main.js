/**
 * Self-Building Game — browser client entry point.
 * Three.js + Colyseus for real-time multiplayer.
 */

import './styles/game.css';
import './styles/mobile.css';
import * as THREE from 'three/webgpu';

import { renderFrame } from './PostProcessing.js';
import { updateConveyorScrolls } from './SurfaceShaders.js';
import { updateSquashStretch } from './PlayerVisuals.js';
import { initEntityManager, animateEntities, animateGroups } from './entities/EntityManager.js';
import { initPhysics, updatePlayer, checkCollisions, createPlayer } from './physics/PhysicsEngine.js';
import { initRemotePlayers, updateChatBubbles, interpolateRemotePlayers } from './rendering/RemotePlayers.js';
import { initParticles, updateEnvironmentEffects, selectParticleType } from './EnvironmentEffects.js';
import { initNetworkManager, sendToServer } from './network/NetworkManager.js';
import { initFloorManager, animateFloors } from './scene/FloorManager.js';
import { fetchInitialState, pollForUpdates } from './network/HttpApi.js';
import { debugAuth } from './auth.js';
import {
  urlParams, isSpectator, isDebug,
  selectedArenaId, setSelectedArenaId, getApiBase, isMobile
} from './config.js';
import {
  state, auth,
  player, playerVelocity,
  camera as cameraState,
  countdown
} from './state.js';
import { updateParticles } from './vfx/ScreenEffects.js';
import { setupChat, displayChatMessage } from './ui/ChatSystem.js';
import { updateUI, updateGameStateUI } from './ui/GameStatusHUD.js';
import { fetchLeaderboard } from './ui/Leaderboard.js';
import { showArenaLobby } from './ui/ArenaLobby.js';
import { startAuthFlow } from './ui/AuthFlow.js';
import { setupProfileButton } from './ui/ProfilePanel.js';
import { setupGameMenu } from './ui/GameMenu.js';
import { setupSpectatorOverlay } from './ui/SpectatorOverlay.js';
import { setupDebugPanel } from './ui/DebugPanel.js';
import { CameraController } from './CameraController.js';
import { keys, setupKeyboardInput, toggleHelpOverlay } from './input/InputManager.js';
import { setupMobileControls } from './input/MobileControls.js';
import { createScene } from './SceneSetup.js';
import { initConnectionManager, connectToServer, reconnectToServer } from './ConnectionManager.js';

window.__gameState = state;
window.debugAuth = debugAuth;

let scene, camera, renderer;
let cameraController;
const timer = new THREE.Timer();

function animate() {
  timer.update();
  const delta = timer.getDelta();
  const time = performance.now() / 1000;

  if (cameraController.isInSpectatorMode()) {
    cameraController.updateSpectatorMovement(delta, keys);
  } else {
    updatePlayer(delta);
    checkCollisions();
  }

  if (player.mesh && !cameraController.isInSpectatorMode()) {
    updateSquashStretch(player.mesh, playerVelocity.y, player.isGrounded);
  }

  interpolateRemotePlayers(delta);
  animateGroups(delta);
  animateEntities(delta, time);

  animateFloors(time);

  updateConveyorScrolls(delta);
  updateEnvironmentEffects(delta, camera.position);
  updateParticles(delta);
  updateChatBubbles();

  if (cameraController.isInSpectatorMode()) cameraController.updateCamera();

  if (state.gameState.phase === 'lobby' && state.lobbyCountdownTarget) {
    if (time - countdown.lastLobbyTick > 1) {
      countdown.lastLobbyTick = time;
      updateGameStateUI();
    }
  }

  renderFrame();
}

window.addEventListener('resize', () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (isMobile) {
    cameraState.distance = (window.innerWidth > window.innerHeight) ? 22 : 25;
  }
});

async function init() {
  console.log('[Game] Initializing...');

  // Async renderer init (WebGPU with WebGL 2 fallback)
  const sceneResult = await createScene();
  scene = sceneResult.scene;
  camera = sceneResult.camera;
  renderer = sceneResult.renderer;
  const { ground, gridHelper, ambientLight, directionalLight } = sceneResult;

  cameraController = new CameraController(camera, renderer);
  cameraController.initDesktopEvents();

  const isInSpectatorMode = () => cameraController.isInSpectatorMode();

  initEntityManager(scene, updateUI);
  initPhysics({
    scene,
    sendToServer,
    getCameraDirections: () => cameraController.getCameraDirections(),
    updateCamera: () => cameraController.updateCamera(),
  });
  initRemotePlayers(scene);
  initConnectionManager({ clearSpectating: () => cameraController.clearSpectating() });
  initNetworkManager({ connectToServerFn: connectToServer, reconnectToServerFn: reconnectToServer });
  initFloorManager({ scene, ground, gridHelper, ambientLight, directionalLight });

  if (isSpectator) {
    auth.user = { token: null, user: { name: 'Spectator', type: 'spectator' } };
  } else {
    auth.user = await startAuthFlow();
  }

  if (!urlParams.get('arena') && !isSpectator) {
    setSelectedArenaId(await showArenaLobby());
  }
  console.log(`[Game] Selected arena: ${selectedArenaId}`);

  await fetchInitialState();
  await connectToServer();
  if (!isSpectator) {
    createPlayer();
  } else {
    const badge = document.createElement('div');
    badge.id = 'spectator-badge';
    badge.textContent = 'SPECTATING';
    document.body.appendChild(badge);
  }

  setupChat();
  setupKeyboardInput({ isInSpectatorMode, fetchLeaderboard, camera });
  fetchLeaderboard();
  if (isSpectator) setupSpectatorOverlay();
  if (isDebug) setupDebugPanel();
  if (isMobile && !isSpectator) setupMobileControls({ keys, rendererDomElement: renderer.domElement, fetchLeaderboard });

  try {
    const chatRes = await fetch(`${getApiBase()}/chat/messages`);
    const chatData = await chatRes.json();
    chatData.messages.forEach(displayChatMessage);
  } catch { /* server may be unavailable */ }

  const loginEl = document.getElementById('login-screen');
  loginEl.classList.add('screen-fade-out');
  setTimeout(() => { loginEl.style.display = 'none'; loginEl.classList.remove('screen-fade-out'); }, 300);

  if (isDebug) document.getElementById('ui').style.display = 'block';
  document.getElementById('controls').style.display = 'block';
  document.getElementById('chat-panel').style.display = 'flex';

  const helpBtn = document.getElementById('help-btn');
  helpBtn.style.display = 'flex';
  helpBtn.addEventListener('click', () => toggleHelpOverlay());
  document.getElementById('help-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) toggleHelpOverlay(false);
  });

  setupProfileButton();
  setupGameMenu();

  const floorType = state.gameState?.floorType || 'solid';
  const particleType = selectParticleType(floorType, state.gameState?.environment) || 'dust';
  initParticles(scene, particleType);

  renderer.setAnimationLoop(animate);

  setInterval(() => { if (!state.connected) pollForUpdates(); }, 10000);
  setInterval(fetchLeaderboard, 10000);

  console.log('[Game] Ready!');
}

init();
