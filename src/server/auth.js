/**
 * Auth Module - Privy verification + JWT signing
 *
 * If PRIVY_APP_ID and PRIVY_APP_SECRET are set, enables Twitter OAuth.
 * Otherwise, only guest mode is available.
 */

import { PrivyClient } from '@privy-io/server-auth';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-min-32-chars!!';
const JWT_EXPIRY = '7d';

let privyClient = null;

export function initAuth() {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (appId && appSecret) {
    privyClient = new PrivyClient(appId, appSecret);
    console.log('[Auth] Privy client initialized');
  } else {
    console.log('[Auth] No Privy credentials — guest-only mode');
  }
}

export async function verifyPrivyToken(accessToken) {
  if (!privyClient || !accessToken) return null;
  try {
    const claims = await privyClient.verifyAuthToken(accessToken);
    let user = await privyClient.getUser(claims.userId);
    const twitter = user.linkedAccounts.find(a => a.type === 'twitter_oauth');

    // Extract embedded EVM wallet address
    let evmWallet = user.linkedAccounts.find(
      a => a.type === 'wallet' && a.walletClientType === 'privy' && a.chainType === 'ethereum'
    );

    // Create EVM wallet server-side if user doesn't have one
    if (!evmWallet) {
      try {
        console.log(`[Auth] Creating EVM wallet for ${claims.userId}...`);
        user = await privyClient.createWallets({ userId: claims.userId, createEthereumWallet: true });
        evmWallet = user.linkedAccounts.find(
          a => a.type === 'wallet' && a.walletClientType === 'privy' && a.chainType === 'ethereum'
        );
        console.log(`[Auth] EVM wallet created: ${evmWallet?.address}`);
      } catch (walletErr) {
        console.warn('[Auth] Wallet creation failed:', walletErr.message);
      }
    }

    return {
      privyUserId: claims.userId,
      twitterUsername: twitter?.username || null,
      twitterAvatar: twitter?.profilePictureUrl || null,
      displayName: twitter?.name || twitter?.username || null,
      walletAddress: evmWallet?.address || null
    };
  } catch (err) {
    console.error('[Auth] Privy verification failed:', err.message);
    return null;
  }
}

export function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function parseBearerToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return verifyToken(header.slice(7));
}

export function requireAuth(req, res, next) {
  const payload = parseBearerToken(req);
  if (!payload) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  req.user = { id: payload.userId };
  next();
}

export function optionalAuth(req, res, next) {
  const payload = parseBearerToken(req);
  if (payload) {
    req.user = { id: payload.userId };
  }
  next();
}
