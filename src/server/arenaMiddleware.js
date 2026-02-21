/**
 * arenaMiddleware - Resolves arenaId from request path or header, injects req.arena
 *
 * Works for both:
 *   /api/arenas/:arenaId/... → specific arena
 *   /api/... → default arena
 *
 * Also validates X-Arena-API-Key for non-default arenas.
 */

export function createArenaMiddleware(arenaManager) {
  return function arenaMiddleware(req, res, next) {
    const arenaId = req.params.arenaId || null;

    let arena;
    if (arenaId) {
      arena = arenaManager.getArena(arenaId);
      if (!arena) {
        return res.status(404).json({ error: `Arena not found: ${arenaId}` });
      }
    } else {
      arena = arenaManager.getDefaultArena();
      if (!arena) {
        return res.status(500).json({ error: 'Default arena not initialized' });
      }
    }

    req.arena = arena;
    req.arenaId = arena.id;
    arena.touch();
    next();
  };
}

/**
 * Middleware to require arena API key for management endpoints
 * Used on non-default arenas for agent/management operations
 */
export function requireArenaKey(req, res, next) {
  const arena = req.arena;
  if (!arena) {
    return res.status(500).json({ error: 'Arena not resolved' });
  }

  // Default arena doesn't need API key (backward compat with agent-runner.js on localhost)
  if (arena.isDefault) {
    return next();
  }

  const apiKey = req.headers['x-arena-api-key'];
  if (!apiKey || apiKey !== arena.apiKey) {
    return res.status(401).json({ error: 'Invalid or missing X-Arena-API-Key' });
  }

  next();
}
