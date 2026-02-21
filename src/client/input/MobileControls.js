/**
 * Mobile touch controls — joystick, camera drag, action buttons.
 */

import { isMobile, JOYSTICK_RADIUS, MIN_PITCH, MAX_PITCH } from '../config.js';
import { camera as cameraState } from '../state.js';

export const touchJoystick = { active: false, startX: 0, startY: 0, dx: 0, dy: 0, id: null };
const touchCamera = { active: false, lastX: 0, lastY: 0, id: null };

export function setupMobileControls(deps) {
  if (!isMobile) return;

  const { keys, rendererDomElement, fetchLeaderboard } = deps;

  const touchUI = document.createElement('div');
  touchUI.id = 'mobile-controls';
  touchUI.innerHTML = `
    <div id="joystick-zone"></div>
    <div id="mobile-buttons">
      <button id="btn-jump" class="mobile-btn jump-btn">JUMP</button>
      <button id="btn-sprint" class="mobile-btn sprint-btn">SPRINT</button>
      <button id="btn-lb-mobile" class="mobile-btn lb-btn">LB</button>
    </div>
    <div id="joystick-visual" style="display:none">
      <div id="joystick-base"></div>
      <div id="joystick-thumb"></div>
    </div>
  `;
  document.body.appendChild(touchUI);

  const joystickZone = document.getElementById('joystick-zone');
  const joystickVisual = document.getElementById('joystick-visual');
  const joystickBase = document.getElementById('joystick-base');
  const joystickThumb = document.getElementById('joystick-thumb');

  joystickZone.addEventListener('touchstart', (e) => {
    if (touchJoystick.active) return;
    const touch = e.changedTouches[0];
    touchJoystick.active = true;
    touchJoystick.id = touch.identifier;
    touchJoystick.startX = touch.clientX;
    touchJoystick.startY = touch.clientY;
    touchJoystick.dx = 0;
    touchJoystick.dy = 0;

    joystickVisual.style.display = 'block';
    joystickVisual.style.left = touch.clientX + 'px';
    joystickVisual.style.top = touch.clientY + 'px';
    joystickBase.style.left = '0px';
    joystickBase.style.top = '0px';
    joystickThumb.style.left = '0px';
    joystickThumb.style.top = '0px';
    e.preventDefault();
  }, { passive: false });

  joystickZone.addEventListener('touchmove', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === touchJoystick.id) {
        let dx = touch.clientX - touchJoystick.startX;
        let dy = touch.clientY - touchJoystick.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > JOYSTICK_RADIUS) {
          dx = dx / dist * JOYSTICK_RADIUS;
          dy = dy / dist * JOYSTICK_RADIUS;
        }
        touchJoystick.dx = dx / JOYSTICK_RADIUS;
        touchJoystick.dy = dy / JOYSTICK_RADIUS;
        joystickThumb.style.left = dx + 'px';
        joystickThumb.style.top = dy + 'px';
      }
    }
    e.preventDefault();
  }, { passive: false });

  const endJoystick = (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === touchJoystick.id) {
        touchJoystick.active = false;
        touchJoystick.dx = 0;
        touchJoystick.dy = 0;
        touchJoystick.id = null;
        joystickVisual.style.display = 'none';
      }
    }
  };
  joystickZone.addEventListener('touchend', endJoystick);
  joystickZone.addEventListener('touchcancel', endJoystick);

  rendererDomElement.addEventListener('touchstart', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.clientX > window.innerWidth * 0.5 && !touchCamera.active) {
        touchCamera.active = true;
        touchCamera.id = touch.identifier;
        touchCamera.lastX = touch.clientX;
        touchCamera.lastY = touch.clientY;
      }
    }
  }, { passive: true });

  rendererDomElement.addEventListener('touchmove', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === touchCamera.id) {
        const dx = touch.clientX - touchCamera.lastX;
        const dy = touch.clientY - touchCamera.lastY;
        cameraState.yaw -= dx * 0.005;
        cameraState.pitch -= dy * 0.005;
        cameraState.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, cameraState.pitch));
        touchCamera.lastX = touch.clientX;
        touchCamera.lastY = touch.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });

  const endCamera = (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === touchCamera.id) {
        touchCamera.active = false;
        touchCamera.id = null;
      }
    }
  };
  rendererDomElement.addEventListener('touchend', endCamera, { passive: true });
  rendererDomElement.addEventListener('touchcancel', endCamera, { passive: true });

  const jumpBtn = document.getElementById('btn-jump');
  const sprintBtn = document.getElementById('btn-sprint');

  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    keys.space = true;
    jumpBtn.classList.add('pressed');
  }, { passive: false });
  jumpBtn.addEventListener('touchend', () => {
    keys.space = false;
    jumpBtn.classList.remove('pressed');
  });

  sprintBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    keys.shift = !keys.shift;
    sprintBtn.classList.toggle('pressed', keys.shift);
  }, { passive: false });

  const lbBtn = document.getElementById('btn-lb-mobile');
  if (lbBtn) {
    lbBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const panel = document.getElementById('leaderboard-panel');
      if (!panel) return;
      const isVisible = panel.style.display === 'block';
      panel.style.display = isVisible ? 'none' : 'block';
      lbBtn.classList.toggle('pressed', !isVisible);
      if (!isVisible) fetchLeaderboard();
    }, { passive: false });
  }

  if (screen.orientation?.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }

  const chatToggle = document.createElement('button');
  chatToggle.id = 'chat-toggle-btn';
  chatToggle.textContent = 'CHAT';
  document.body.appendChild(chatToggle);
  const chatPanel = document.getElementById('chat-panel');
  let chatVisible = true;
  chatToggle.addEventListener('touchstart', (e) => {
    e.preventDefault();
    chatVisible = !chatVisible;
    if (chatPanel) chatPanel.style.display = chatVisible ? 'flex' : 'none';
    chatToggle.style.borderColor = chatVisible ? '#2ecc71' : 'rgba(255,255,255,0.3)';
  }, { passive: false });

  // Virtual keyboard handling — move chat up when input focused in landscape
  const chatInput = document.getElementById('chat-input');
  if (chatInput && chatPanel) {
    chatInput.addEventListener('focus', () => {
      if (window.innerHeight < 500) {
        chatPanel.style.bottom = '50%';
      }
    });
    chatInput.addEventListener('blur', () => {
      chatPanel.style.bottom = '';
    });
  }
}
