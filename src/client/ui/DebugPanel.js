/**
 * Debug panel — AI/agent toggle, status polling.
 */

import { getApiBase } from '../config.js';

export function setupDebugPanel() {
  const panel = document.getElementById('debug-panel');
  if (!panel) return;
  panel.style.display = 'block';

  const aiToggle = document.getElementById('toggle-ai');
  const agentToggle = document.getElementById('toggle-agent');
  const debugInfo = document.getElementById('debug-info');

  async function refreshStatus() {
    try {
      const [aiRes, agentRes] = await Promise.all([
        fetch(`${getApiBase()}/ai/status`),
        fetch(`${getApiBase()}/agent/status`)
      ]);
      const aiData = await aiRes.json();
      const agentData = await agentRes.json();
      aiToggle.checked = aiData.enabled;
      agentToggle.checked = !agentData.paused;
      debugInfo.textContent = `AI: ${aiData.count} bots | Agent: ${agentData.phase} | Drama: ${agentData.drama}`;
    } catch { /* silent */ }
  }

  aiToggle.addEventListener('change', async () => {
    const suffix = aiToggle.checked ? '/ai/enable' : '/ai/disable';
    await fetch(`${getApiBase()}${suffix}`, { method: 'POST' });
    refreshStatus();
  });

  agentToggle.addEventListener('change', async () => {
    const suffix = agentToggle.checked ? '/agent/resume' : '/agent/pause';
    await fetch(`${getApiBase()}${suffix}`, { method: 'POST' });
    refreshStatus();
  });

  refreshStatus();
  setInterval(refreshStatus, 5000);
}
