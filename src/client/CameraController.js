/**
 * Camera controller — player follow camera + spectator modes.
 * Pre-allocates Vector3s to eliminate per-frame GC allocations.
 */

import * as THREE from 'three/webgpu';
import { MIN_PITCH, MAX_PITCH, MIN_DISTANCE, MAX_DISTANCE, SPEC_FLY_SPEED, SPEC_FAST_SPEED, isMobile, isSpectator } from './config.js';
import { state, camera as cameraState, spectator, spectatorPos, cameraShake, remotePlayers, player } from './state.js';
import { updateCameraShake } from './vfx/ScreenEffects.js';

export class CameraController {
  constructor(threeCamera, renderer) {
    this.camera = threeCamera;
    this.renderer = renderer;

    this._tempLookTarget = new THREE.Vector3();
    this._tempForward = new THREE.Vector3();
    this._tempRight = new THREE.Vector3();
    this._tempMove = new THREE.Vector3();
  }

  initDesktopEvents() {
    if (isMobile) return;

    this.renderer.domElement.addEventListener('click', () => {
      if (!state.chatFocused && !this.isInSpectatorMode()) {
        this.renderer.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      cameraState.pointerLocked = document.pointerLockElement === this.renderer.domElement;
      const crosshair = document.getElementById('crosshair');
      if (crosshair) crosshair.style.display = cameraState.pointerLocked ? 'block' : 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (cameraState.pointerLocked) {
        cameraState.yaw -= e.movementX * 0.003;
        cameraState.pitch -= e.movementY * 0.003;
        cameraState.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, cameraState.pitch));
      } else if (spectator.dragging && this.isInSpectatorMode()) {
        cameraState.yaw -= e.movementX * 0.003;
        cameraState.pitch -= e.movementY * 0.003;
        cameraState.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, cameraState.pitch));
      }
    });

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (this.isInSpectatorMode() && e.button === 0) {
        spectator.dragging = true;
      }
    });
    document.addEventListener('mouseup', () => {
      spectator.dragging = false;
    });

    document.addEventListener('wheel', (e) => {
      cameraState.distance += e.deltaY * 0.02;
      cameraState.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, cameraState.distance));
    });
  }

  isInSpectatorMode() {
    return isSpectator || state.isSpectating;
  }

  clearSpectating() {
    state.isSpectating = false;
    const banner = document.getElementById('spectator-banner');
    if (banner) banner.remove();
  }

  updateCamera() {
    if (this.isInSpectatorMode()) {
      this._updateSpectatorCamera();
      return;
    }

    if (!player.mesh) return;

    const target = player.mesh.position;

    const offsetX = Math.sin(cameraState.yaw) * Math.cos(cameraState.pitch) * cameraState.distance;
    const offsetY = Math.sin(cameraState.pitch) * cameraState.distance;
    const offsetZ = Math.cos(cameraState.yaw) * Math.cos(cameraState.pitch) * cameraState.distance;

    updateCameraShake();
    this.camera.position.set(
      target.x + offsetX + cameraShake.offset.x,
      target.y + offsetY + 2 + cameraShake.offset.y,
      target.z + offsetZ + cameraShake.offset.z
    );
    this.camera.lookAt(target.x, target.y + 1, target.z);
  }

  _updateSpectatorCamera() {
    if (spectator.freeMode) {
      this.camera.position.copy(spectatorPos);
      this._tempLookTarget.set(
        spectatorPos.x - Math.sin(cameraState.yaw) * Math.cos(cameraState.pitch),
        spectatorPos.y - Math.sin(cameraState.pitch),
        spectatorPos.z - Math.cos(cameraState.yaw) * Math.cos(cameraState.pitch)
      );
      this.camera.lookAt(this._tempLookTarget);
      return;
    }

    const allPlayers = Array.from(remotePlayers.entries());

    if (allPlayers.length === 0) {
      const dist = 40;
      const elevAngle = cameraState.pitch + 0.3;
      const y = dist * Math.sin(elevAngle);
      const horiz = dist * Math.cos(elevAngle);
      this.camera.position.set(
        Math.sin(cameraState.yaw) * horiz,
        y,
        Math.cos(cameraState.yaw) * horiz
      );
      this.camera.lookAt(0, 5, 0);
      return;
    }

    let targetMesh;
    if (spectator.followIndex >= 0 && spectator.followIndex < allPlayers.length) {
      targetMesh = allPlayers[spectator.followIndex][1];
    } else {
      let highest = allPlayers[0][1];
      for (const [, mesh] of allPlayers) {
        if (mesh.position.y > highest.position.y) highest = mesh;
      }
      targetMesh = highest;
    }

    if (targetMesh) {
      const dist = 25;
      const elevAngle = cameraState.pitch + 0.3;
      const y = targetMesh.position.y + dist * Math.sin(elevAngle);
      const horiz = dist * Math.cos(elevAngle);
      this.camera.position.set(
        targetMesh.position.x + Math.sin(cameraState.yaw) * horiz,
        y,
        targetMesh.position.z + Math.cos(cameraState.yaw) * horiz
      );
      this.camera.lookAt(targetMesh.position.x, targetMesh.position.y + 1, targetMesh.position.z);
    }
  }

  getCameraDirections() {
    this._tempForward.set(-Math.sin(cameraState.yaw), 0, -Math.cos(cameraState.yaw)).normalize();
    this._tempRight.set(-this._tempForward.z, 0, this._tempForward.x);
    return { forward: this._tempForward, right: this._tempRight };
  }

  updateSpectatorMovement(delta, keys) {
    if (!spectator.freeMode) return;
    const speed = keys.shift ? SPEC_FAST_SPEED : SPEC_FLY_SPEED;
    this._tempForward.set(
      -Math.sin(cameraState.yaw) * Math.cos(cameraState.pitch),
      -Math.sin(cameraState.pitch),
      -Math.cos(cameraState.yaw) * Math.cos(cameraState.pitch)
    ).normalize();
    this._tempRight.set(-this._tempForward.z, 0, this._tempForward.x).normalize();
    this._tempMove.set(0, 0, 0);
    if (keys.w) this._tempMove.add(this._tempForward);
    if (keys.s) this._tempMove.sub(this._tempForward);
    if (keys.a) this._tempMove.sub(this._tempRight);
    if (keys.d) this._tempMove.add(this._tempRight);
    if (keys.space) this._tempMove.y += 1;
    if (keys.shift && !keys.w && !keys.s && !keys.a && !keys.d) this._tempMove.y -= 1;
    if (this._tempMove.lengthSq() > 0) {
      this._tempMove.normalize().multiplyScalar(speed * delta);
      spectatorPos.add(this._tempMove);
    }
  }
}
