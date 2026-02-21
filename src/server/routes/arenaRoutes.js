import { saveArena, deleteArenaFromDB } from '../db.js';

export function mountArenaRoutes(app, ctx) {
  const { arenaManager, arenaService, gameService } = ctx;

  app.get('/api/arenas', (req, res) => {
    res.json({ arenas: arenaManager.listArenas() });
  });

  app.post('/api/arenas', (req, res) => {
    try {
      const { arena, apiKey } = arenaManager.createArena(req.body);
      arenaService.setupArenaCallbacks(arena, gameService);

      // Persist to DB
      saveArena(arena);

      res.json({
        arenaId: arena.id,
        apiKey,
        name: arena.name,
        endpoints: {
          context: `/api/arenas/${arena.id}/agent/context`,
          compose: `/api/arenas/${arena.id}/world/compose`,
          startGame: `/api/arenas/${arena.id}/game/start`,
          endGame: `/api/arenas/${arena.id}/game/end`,
          castSpell: `/api/arenas/${arena.id}/spell/cast`,
          announce: `/api/arenas/${arena.id}/announce`,
          chat: `/api/arenas/${arena.id}/chat/send`,
          gameState: `/api/arenas/${arena.id}/game/state`,
        }
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/arenas/:id/info', (req, res) => {
    const arena = arenaManager.getArena(req.params.id);
    if (!arena) return res.status(404).json({ error: `Arena not found: ${req.params.id}` });
    res.json(arena.getPublicInfo());
  });

  app.patch('/api/arenas/:id', (req, res) => {
    const arena = arenaManager.getArena(req.params.id);
    if (!arena) return res.status(404).json({ error: `Arena not found: ${req.params.id}` });
    if (arena.isDefault) return res.status(403).json({ error: 'Cannot modify default arena' });

    const apiKey = req.headers['x-arena-api-key'];
    if (!apiKey || apiKey !== arena.apiKey) {
      return res.status(401).json({ error: 'Invalid or missing X-Arena-API-Key' });
    }

    const { name, description, gameMasterName, config } = req.body;
    if (name) arena.name = name;
    if (description !== undefined) arena.description = description;
    if (gameMasterName) arena.gameMasterName = gameMasterName;
    if (config) Object.assign(arena.config, config);

    saveArena(arena);
    res.json({ success: true, arena: arena.getPublicInfo() });
  });

  app.delete('/api/arenas/:id', (req, res) => {
    const arena = arenaManager.getArena(req.params.id);
    if (!arena) return res.status(404).json({ error: `Arena not found: ${req.params.id}` });

    const apiKey = req.headers['x-arena-api-key'];
    if (!apiKey || apiKey !== arena.apiKey) {
      return res.status(401).json({ error: 'Invalid or missing X-Arena-API-Key' });
    }

    try {
      arenaManager.deleteArena(req.params.id);
      deleteArenaFromDB(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/arenas/:id/upvote', (req, res) => {
    const arena = arenaManager.getArena(req.params.id);
    if (!arena) return res.status(404).json({ error: `Arena not found: ${req.params.id}` });
    arena.upvotes++;
    res.json({ success: true, upvotes: arena.upvotes });
  });
}
