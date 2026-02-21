export function mountWorldRoutes(router, ctx) {
  const { gameService } = ctx;

  router.get('/world/state', (req, res) => {
    res.json(req.arena.worldState.getState());
  });

  router.post('/world/spawn', (req, res) => {
    const arena = req.arena;
    const { type, position, scale, properties } = req.body;
    if (!type || !position) {
      return res.status(400).json({ error: 'Missing required: type, position' });
    }
    try {
      const entity = arena.worldState.addEntity({ type, position, scale: scale || [1, 1, 1], properties });
      arena.broadcastToRoom('entity_added', entity);
      res.json({ success: true, entity });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  router.post('/world/modify', (req, res) => {
    const arena = req.arena;
    const { id, changes } = req.body;
    if (!id || !changes) {
      return res.status(400).json({ error: 'Missing required: id, changes' });
    }
    try {
      const entity = arena.worldState.modifyEntity(id, changes);
      arena.broadcastToRoom('entity_modified', entity);
      res.json({ success: true, entity });
    } catch (error) {
      res.status(404).json({ success: false, error: error.message });
    }
  });

  router.post('/world/destroy', (req, res) => {
    const arena = req.arena;
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Missing required: id' });
    }
    try {
      arena.worldState.destroyEntity(id);
      arena.broadcastToRoom('entity_destroyed', { id });
      res.json({ success: true });
    } catch (error) {
      res.status(404).json({ success: false, error: error.message });
    }
  });

  router.post('/world/clear', (req, res) => {
    const arena = req.arena;
    if (gameService.rejectIfActiveGame(arena, res)) return;
    if (gameService.rejectIfLobbyTimer(arena, res)) return;

    const ids = arena.worldState.clearEntities();
    arena.broadcastToRoom('world_cleared');
    arena.broadcastToRoom('physics_changed', arena.worldState.physics);
    arena.broadcastToRoom('environment_changed', arena.worldState.environment);
    res.json({ success: true, cleared: ids.length });
  });

  router.post('/world/spawn-prefab', (req, res) => {
    res.status(400).json({ error: 'Use POST /api/world/spawn or POST /api/world/compose instead' });
  });

  router.post('/world/compose', (req, res) => {
    const arena = req.arena;
    if (gameService.rejectIfLobbyTimer(arena, res)) return;

    const { description, position, type, scale, properties } = req.body;
    if (!description || !position) {
      return res.status(400).json({ error: 'Missing required: description, position' });
    }

    try {
      const entity = arena.worldState.addEntity({
        type: type || 'platform',
        position,
        scale: scale || [1, 1, 1],
        properties: { ...properties, description },
      });
      arena.broadcastToRoom('entity_added', entity);
      if (arena.agentLoop) arena.agentLoop.notifyAgentAction();
      res.json({ success: true, entity });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  router.post('/world/destroy-group', (req, res) => {
    const arena = req.arena;
    const { groupId } = req.body;
    if (!groupId) {
      return res.status(400).json({ error: 'Missing required: groupId' });
    }

    const ids = arena.worldState.destroyGroup(groupId);
    if (ids.length === 0) {
      return res.status(404).json({ error: `No entities found with groupId: ${groupId}` });
    }

    arena.broadcastToRoom('entities_destroyed_batch', { ids });
    res.json({ success: true, destroyed: ids.length, entityIds: ids });
  });

  router.post('/world/floor', (req, res) => {
    const arena = req.arena;
    const { type } = req.body;
    try {
      const floorType = arena.worldState.setFloorType(type);
      arena.broadcastToRoom('floor_changed', { type: floorType });
      res.json({ success: true, floorType });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/world/floor', (req, res) => {
    res.json({ floorType: req.arena.worldState.floorType });
  });

  router.post('/world/hazard-plane', (req, res) => {
    const arena = req.arena;
    try {
      const state = arena.worldState.setHazardPlane(req.body);
      arena.broadcastToRoom('hazard_plane_changed', state);
      res.json({ success: true, hazardPlane: state });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/world/hazard-plane', (req, res) => {
    res.json({ hazardPlane: { ...req.arena.worldState.hazardPlane } });
  });

  router.post('/world/environment', (req, res) => {
    const arena = req.arena;
    try {
      const env = arena.worldState.setEnvironment(req.body);
      arena.broadcastToRoom('environment_changed', env);
      res.json({ success: true, environment: env });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/world/environment', (req, res) => {
    res.json({ environment: { ...req.arena.worldState.environment } });
  });

  router.post('/world/respawn', (req, res) => {
    const arena = req.arena;
    const { position } = req.body;
    if (!position || !Array.isArray(position) || position.length !== 3) {
      return res.status(400).json({ error: 'Missing required: position [x,y,z]' });
    }
    const rp = arena.worldState.setRespawnPoint(position);
    arena.broadcastToRoom('respawn_point_changed', { position: rp });
    res.json({ success: true, respawnPoint: rp });
  });

  router.post('/world/template', (req, res) => {
    const arena = req.arena;
    const phase = arena.worldState.gameState.phase;
    if (phase === 'lobby' || phase === 'building') {
      return res.status(400).json({
        error: 'Cannot load template during lobby. Use start_game with a template parameter instead. Example: POST /api/game/start { "template": "parkour_hell" }'
      });
    }
    if (gameService.rejectIfActiveGame(arena, res)) return;

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing required: name' });
    }

    import('../ArenaTemplates.js').then(({ TEMPLATES }) => {
      const template = TEMPLATES[name];
      if (!template) {
        return res.status(404).json({
          error: `Template not found: ${name}. Available: ${Object.keys(TEMPLATES).join(', ')}`
        });
      }

      const spawned = gameService.applyTemplate(arena, template);
      arena.worldState.lastTemplateLoadTime = Date.now();

      res.json({
        success: true, template: name, name: template.name,
        gameType: template.gameType, floorType: template.floorType || 'solid',
        entitiesSpawned: spawned.length, goalPosition: template.goalPosition || null
      });
    }).catch(err => {
      res.status(500).json({ error: err.message });
    });
  });

  router.post('/physics/set', (req, res) => {
    const arena = req.arena;
    const { gravity, friction, bounce } = req.body;
    try {
      const physics = arena.worldState.setPhysics({ gravity, friction, bounce });
      arena.broadcastToRoom('physics_changed', physics);
      res.json({ success: true, physics });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
}
