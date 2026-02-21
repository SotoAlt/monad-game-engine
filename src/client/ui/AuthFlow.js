/**
 * Authentication flow — Privy init, OAuth callback, guest/twitter login.
 */

import { API_URL } from '../config.js';
import {
  initPrivy, handleOAuthCallback, exchangeForBackendToken, ensureEmbeddedWallet,
  loginAsGuest, loginWithTwitter, getPrivyUser, getToken
} from '../auth.js';

export async function startAuthFlow() {
  const splash = document.getElementById('login-splash');
  const buttonsContainer = document.getElementById('login-buttons-container');
  const statusEl = document.getElementById('login-status');
  const continueBtn = document.getElementById('btn-continue');
  const twitterBtn = document.getElementById('btn-twitter-login');

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function hideLoginScreen() {
    const el = document.getElementById('login-screen');
    el.classList.add('screen-fade-out');
    setTimeout(() => { el.style.display = 'none'; el.classList.remove('screen-fade-out'); }, 300);
  }

  const appId = import.meta.env.VITE_PRIVY_APP_ID;
  const clientId = import.meta.env.VITE_PRIVY_CLIENT_ID;
  const privyEnabled = !!(appId && clientId);

  let privyReady = false;
  let privyInitPromise = Promise.resolve();

  if (privyEnabled) {
    privyInitPromise = initPrivy(appId, clientId).then(() => {
      privyReady = true;
      if (twitterBtn) {
        twitterBtn.disabled = false;
        twitterBtn.innerHTML = 'Login with X (Twitter)';
      }
    }).catch(e => {
      console.error('[Auth] Privy init failed:', e);
      if (twitterBtn) {
        twitterBtn.textContent = 'Twitter Unavailable';
        twitterBtn.disabled = true;
      }
    });
  } else if (twitterBtn) {
    twitterBtn.style.display = 'none';
  }

  const existingToken = getToken();
  if (existingToken) {
    try {
      const res = await fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${existingToken}` }
      });
      if (res.ok) {
        const user = await res.json();
        hideLoginScreen();
        return { token: existingToken, user };
      }
    } catch { /* token invalid or server unreachable */ }
    localStorage.removeItem('game:token');
  }

  const params = new URLSearchParams(window.location.search);
  const isOAuthCallback = privyEnabled
    && (params.has('privy_oauth_code') || params.has('privy_oauth_state'));

  if (isOAuthCallback) {
    const splashStatus = splash?.querySelector('.login-status');
    if (splashStatus) splashStatus.textContent = 'Connecting to Twitter...';
    await privyInitPromise;
    try {
      if (splashStatus) splashStatus.textContent = 'Authenticating...';
      const callbackUser = await handleOAuthCallback();
      if (callbackUser) {
        if (splashStatus) splashStatus.textContent = 'Logging in...';
        const result = await exchangeForBackendToken();
        if (result) {
          hideLoginScreen();
          return result;
        }
      }
    } catch (e) {
      console.error('[Auth] OAuth callback failed:', e);
    }
  }

  if (splash) splash.style.display = 'none';
  if (buttonsContainer) buttonsContainer.style.display = 'block';

  if (privyReady) {
    try {
      const privyUser = await getPrivyUser();
      const result = privyUser ? await exchangeForBackendToken() : null;
      if (result && continueBtn) {
        const userName = result.user?.name || result.user?.twitterUsername || 'Player';
        continueBtn.textContent = `Continue as ${userName}`;
        continueBtn.style.display = 'block';
      }
    } catch (e) {
      console.warn('[Auth] Privy session check failed:', e);
    }
  }

  return new Promise((resolve) => {
    continueBtn?.addEventListener('click', async () => {
      const token = getToken();
      if (token) {
        await ensureEmbeddedWallet();
        hideLoginScreen();
        resolve({ token, user: { name: continueBtn.textContent.replace('Continue as ', '') } });
      }
    });

    twitterBtn?.addEventListener('click', async () => {
      if (!privyReady) {
        setStatus('Still loading Twitter... please wait');
        await privyInitPromise;
        if (!privyReady) {
          setStatus('Twitter login unavailable. Try Guest mode.');
          return;
        }
      }
      setStatus('Redirecting to Twitter...');
      try {
        await loginWithTwitter();
      } catch (e) {
        setStatus('Login failed: ' + (e.message || 'Unknown error'));
      }
    });

    document.getElementById('btn-guest').addEventListener('click', async () => {
      setStatus('Creating guest session...');
      const result = await loginAsGuest();
      if (result) {
        hideLoginScreen();
        resolve(result);
      } else {
        setStatus('Failed to create session. Try again.');
      }
    });
  });
}
