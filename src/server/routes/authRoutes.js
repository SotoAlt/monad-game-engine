import { verifyPrivyToken, signToken, requireAuth } from '../auth.js';
import { upsertUser, findUser } from '../db.js';

export function mountAuthRoutes(app) {
  app.post('/api/auth/privy', async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Missing accessToken' });

    const privyResult = await verifyPrivyToken(accessToken);
    if (!privyResult) return res.status(401).json({ error: 'Invalid Privy token' });

    const { privyUserId, twitterUsername, twitterAvatar, displayName, walletAddress } = privyResult;
    const name = twitterUsername || displayName || `User-${privyUserId.slice(-6)}`;

    upsertUser(privyUserId, name, 'authenticated', { privyUserId, twitterUsername, twitterAvatar, walletAddress });

    const token = signToken(privyUserId);
    res.json({
      token,
      user: { id: privyUserId, name, type: 'authenticated', twitterUsername, twitterAvatar, walletAddress }
    });
  });

  app.post('/api/auth/guest', (req, res) => {
    const name = req.body.name || `Guest-${Date.now().toString(36)}`;
    const guestId = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    upsertUser(guestId, name, 'guest');

    const token = signToken(guestId);
    res.json({ token, user: { id: guestId, name, type: 'guest' } });
  });

  app.get('/api/me', requireAuth, async (req, res) => {
    const user = await findUser(req.user.id);
    if (!user) {
      const id = req.user.id;
      const type = id.startsWith('guest-') ? 'guest' : 'authenticated';
      const name = id.startsWith('guest-') ? `Guest-${id.split('-')[1]}` : id;
      return res.json({ id, name, type });
    }
    res.json(user);
  });
}
