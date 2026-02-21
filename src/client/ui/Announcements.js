/**
 * Announcements, toasts, spell effects, and reconnect overlay.
 */

import { state } from '../state.js';
import { MAX_VISIBLE_ANNOUNCEMENTS } from '../config.js';

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 400);
  }, 3000);
}

export function enforceAnnouncementLimit(container) {
  while (container.children.length >= MAX_VISIBLE_ANNOUNCEMENTS) {
    const oldest = container.firstChild;
    const oldId = oldest.id?.replace('ann-', '');
    oldest.remove();
    if (oldId) state.announcements.delete(oldId);
  }
}

export function showAnnouncement(announcement) {
  const container = document.getElementById('announcements');

  if (state.announcements.has(announcement.id)) return;

  enforceAnnouncementLimit(container);

  const div = document.createElement('div');
  div.className = `announcement ${announcement.type || 'agent'}`;
  div.textContent = announcement.text;
  div.id = `ann-${announcement.id}`;
  container.appendChild(div);

  state.announcements.set(announcement.id, true);

  const duration = Math.min(announcement.duration || 5000, 4000);
  setTimeout(() => {
    div.classList.add('fade-out');
    setTimeout(() => {
      div.remove();
      state.announcements.delete(announcement.id);
    }, 500);
  }, duration - 500);

  console.log(`[Announcement] ${announcement.type}: ${announcement.text}`);
}

/**
 * Show reconnecting overlay.
 * @param {number} attempt - Current attempt number, or -1 for "Connection Lost" with reload button.
 */
export function showReconnectOverlay(attempt) {
  let overlay = document.getElementById('reconnect-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'reconnect-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);color:#fff;font-family:inherit;';
    document.body.appendChild(overlay);
  }

  if (attempt === -1) {
    overlay.innerHTML = `
      <div style="font-size:28px;font-weight:bold;margin-bottom:12px;color:#e74c3c;">Connection Lost</div>
      <div style="font-size:16px;margin-bottom:24px;color:#aaa;">Could not reconnect to the server.</div>
      <button id="reconnect-reload-btn" style="padding:12px 32px;font-size:18px;border:none;border-radius:8px;background:#3498db;color:#fff;cursor:pointer;">Reload</button>
    `;
    document.getElementById('reconnect-reload-btn')?.addEventListener('click', () => window.location.reload());
  } else {
    overlay.innerHTML = `
      <div style="width:40px;height:40px;border:4px solid rgba(255,255,255,0.2);border-top:4px solid #fff;border-radius:50%;animation:reconnect-spin 0.8s linear infinite;margin-bottom:16px;"></div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px;">Reconnecting...</div>
      <div style="font-size:14px;color:#aaa;">Attempt ${attempt}</div>
      <style>@keyframes reconnect-spin { to { transform: rotate(360deg); } }</style>
    `;
  }
}

export function hideReconnectOverlay() {
  document.getElementById('reconnect-overlay')?.remove();
  // Also remove old-style connection warning banner
  document.getElementById('connection-warning')?.remove();
}

export function showSpellEffect(spell) {
  const container = document.getElementById('announcements');

  enforceAnnouncementLimit(container);

  const div = document.createElement('div');
  div.className = 'announcement agent';
  div.textContent = `${spell.name}!`;
  div.style.fontSize = '24px';
  container.appendChild(div);

  setTimeout(() => {
    div.classList.add('fade-out');
    setTimeout(() => div.remove(), 500);
  }, 2500);
}
