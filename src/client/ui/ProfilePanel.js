/**
 * Profile button and wallet panel — overview, history, fund tabs.
 */

import { state, auth } from '../state.js';
import { isSpectator, API_URL } from '../config.js';
import { getToken, getEmbeddedWalletAddress, exportWallet, logout } from '../auth.js';
import { showToast } from './Announcements.js';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" fill="#555"/>' +
  '<text x="16" y="21" text-anchor="middle" fill="#aaa" font-size="16" font-family="sans-serif">?</text>' +
  '</svg>'
);

function getTwitterFields(user) {
  return {
    avatar: user.twitterAvatar || user.twitter_avatar,
    username: user.twitterUsername || user.twitter_username
  };
}

function setAvatarSrc(imgEl, src) {
  imgEl.src = src || DEFAULT_AVATAR;
  imgEl.onerror = () => { imgEl.src = DEFAULT_AVATAR; };
}

export function setupProfileButton() {
  if (isSpectator) return;

  const profileBtn = document.getElementById('profile-btn');
  const walletPanel = document.getElementById('wallet-panel');
  if (!profileBtn || !walletPanel) return;

  const user = auth.user?.user;
  if (!user) return;

  const isAuthenticated = user.type === 'authenticated';
  const twitter = getTwitterFields(user);

  setAvatarSrc(
    document.getElementById('profile-pfp'),
    isAuthenticated ? twitter.avatar : null
  );

  const profileName = isAuthenticated && twitter.username
    ? `@${twitter.username}`
    : (user.name || 'Player');
  document.getElementById('profile-name').textContent = profileName;

  profileBtn.style.display = 'flex';

  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    walletPanel.style.display = walletPanel.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', (e) => {
    if (!walletPanel.contains(e.target) && !profileBtn.contains(e.target)) {
      walletPanel.style.display = 'none';
    }
  });

  populateWalletPanel(user);
}

function formatRelativeDate(date) {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function populateWalletPanel(user) {
  const isAuthenticated = user.type === 'authenticated';
  const twitter = getTwitterFields(user);

  setAvatarSrc(document.getElementById('wp-pfp'), isAuthenticated ? twitter.avatar : null);
  document.getElementById('wp-display-name').textContent = user.name || twitter.username || 'Player';
  const usernameLabel = isAuthenticated && twitter.username
    ? `@${twitter.username}`
    : user.type === 'guest' ? 'Guest' : '';
  document.getElementById('wp-username').textContent = usernameLabel;

  const guestMsg = document.getElementById('wp-guest-msg');
  const tabsContainer = document.getElementById('wp-tabs-container');
  const exportBtn = document.getElementById('wp-export');

  document.getElementById('wp-logout').addEventListener('click', async () => {
    await logout();
    window.location.reload();
  });

  if (!isAuthenticated) {
    tabsContainer.style.display = 'none';
    exportBtn.style.display = 'none';
    guestMsg.style.display = 'block';
    return;
  }

  guestMsg.style.display = 'none';
  tabsContainer.style.display = 'block';
  exportBtn.style.display = 'block';

  const tabs = tabsContainer.querySelectorAll('.wp-tab');
  const tabContents = tabsContainer.querySelectorAll('.wp-tab-content');
  let historyLoaded = false;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.getElementById(`wp-tab-${target}`).classList.add('active');
      if (target === 'history' && !historyLoaded) {
        historyLoaded = true;
        loadTransactionHistory();
      }
    });
  });

  const userId = user.id;
  const addressEl = document.getElementById('wp-address');
  const balanceEl = document.getElementById('wp-balance');
  const copyBtn = document.getElementById('wp-copy');
  const explorerBtn = document.getElementById('wp-explorer');
  const explorerBase = 'https://monadscan.com/address';

  function displayAddress(addr) {
    addressEl.textContent = addr.slice(0, 6) + '...' + addr.slice(-4);
    addressEl.dataset.full = addr;
    const fundAddr = document.getElementById('wp-fund-address');
    if (fundAddr) fundAddr.textContent = addr;
  }

  const existingAddr = user.walletAddress || user.wallet_address;
  if (existingAddr) {
    displayAddress(existingAddr);
  }

  async function refreshWallet() {
    const clientAddr = await getEmbeddedWalletAddress();
    if (clientAddr) {
      displayAddress(clientAddr);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/wallet/${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.hasWallet && data.walletAddress) {
        displayAddress(data.walletAddress);
      } else {
        addressEl.textContent = 'No wallet yet';
      }
    } catch {
      if (!addressEl.dataset.full) addressEl.textContent = 'Unavailable';
    }
  }

  async function refreshBalance() {
    try {
      const balanceId = addressEl.dataset.full || state.room?.sessionId || userId;
      const res = await fetch(`${API_URL}/api/balance/${balanceId}`);
      if (!res.ok) return;
      const data = await res.json();
      balanceEl.textContent = parseFloat(data.balance || 0).toFixed(4);
    } catch { /* silent */ }
  }

  refreshWallet();
  refreshBalance();
  setInterval(refreshBalance, 30000);

  copyBtn.addEventListener('click', () => {
    const full = addressEl.dataset.full;
    if (!full) return;
    navigator.clipboard.writeText(full).then(() => {
      copyBtn.innerHTML = '&#x2713;';
      copyBtn.style.color = '#2ecc71';
      showToast('Address copied!');
      setTimeout(() => {
        copyBtn.innerHTML = '&#x2398;';
        copyBtn.style.color = '';
      }, 2000);
    });
  });

  explorerBtn.addEventListener('click', () => {
    const full = addressEl.dataset.full;
    if (full) window.open(`${explorerBase}/${full}`, '_blank');
  });

  async function loadTransactionHistory() {
    const listEl = document.getElementById('wp-tx-list');
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/api/transactions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        listEl.innerHTML = '<div class="wp-tx-empty">Could not load history</div>';
        return;
      }
      const { transactions } = await res.json();
      if (!transactions.length) {
        listEl.innerHTML = '<div class="wp-tx-empty">No transactions yet</div>';
        return;
      }
      listEl.innerHTML = transactions.map(tx => {
        const date = new Date(tx.createdAt);
        const relative = formatRelativeDate(date);
        const statusClass = tx.status || 'pending';
        const amountLabel = `${tx.amount} MON`;
        const hashLink = tx.txHash
          ? `<a class="wp-tx-hash" href="https://monadscan.com/tx/${tx.txHash}" target="_blank">${tx.txHash.slice(0, 8)}...</a>`
          : '';
        return `<div class="wp-tx-item">
          <div class="wp-tx-info">
            <div class="wp-tx-label">${tx.description || tx.txType}</div>
            <div class="wp-tx-date">${relative} ${hashLink}</div>
          </div>
          <div class="wp-tx-right">
            <div class="wp-tx-amount">${amountLabel}</div>
            <span class="wp-tx-status ${statusClass}">${statusClass}</span>
          </div>
        </div>`;
      }).join('');
    } catch {
      listEl.innerHTML = '<div class="wp-tx-empty">Failed to load</div>';
    }
  }

  document.getElementById('wp-fund-hint').textContent = 'Send MON to this address from MetaMask or an exchange.';

  const fundAddrEl = document.getElementById('wp-fund-address');
  fundAddrEl.addEventListener('click', () => {
    const full = addressEl.dataset.full;
    if (full) {
      navigator.clipboard.writeText(full).then(() => showToast('Address copied!'));
    }
  });

  exportBtn.addEventListener('click', async () => {
    try {
      await exportWallet();
    } catch (e) {
      console.error('[Wallet] Export failed:', e);
      showToast('Could not export wallet', 'error');
    }
  });
}
