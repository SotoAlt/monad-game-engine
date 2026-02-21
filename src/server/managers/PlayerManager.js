export class PlayerManager {
  /**
   * @param {function} getRespawnPoint - () => [x, y, z]
   * @param {function} getGamePhase - () => string
   * @param {function} resetLobbyTimer - () => void
   */
  constructor(getRespawnPoint, getGamePhase, resetLobbyTimer) {
    this._getRespawnPoint = getRespawnPoint;
    this._getGamePhase = getGamePhase;
    this._resetLobbyTimer = resetLobbyTimer;
    this.players = new Map();
    this.onPlayerJoin = null;
  }

  addPlayer(id, name, type = 'human', initialState = 'alive', userId = null) {
    const respawnPoint = this._getRespawnPoint();
    const player = {
      id,
      name,
      type, // 'human' or 'ai'
      userId: userId || id,
      position: [...respawnPoint],
      velocity: [0, 0, 0],
      state: initialState,
      joinedAt: Date.now(),
      lastActivity: Date.now(),
      activityAnchor: [...respawnPoint],
      afkWarningToken: null,
      afkWarningSentAt: null,
    };

    // Reset lobby timer when first human joins an empty lobby
    if (type === 'human' && this._getGamePhase() === 'lobby') {
      const hasExistingHumans = [...this.players.values()].some(p => p.type === 'human');
      if (!hasExistingHumans) {
        this._resetLobbyTimer();
      }
    }

    this.players.set(id, player);
    console.log(`[PlayerManager] Player joined: ${name} (${type}, ${initialState})`);
    if (typeof this.onPlayerJoin === 'function') this.onPlayerJoin(player);
    return player;
  }

  activateSpectators() {
    let activated = 0;
    for (const player of this.players.values()) {
      if (player.state === 'spectating' && player.type !== 'spectator') {
        player.state = 'alive';
        activated++;
      }
    }
    if (activated > 0) {
      console.log(`[PlayerManager] Activated ${activated} spectating players`);
    }
    return activated;
  }

  updatePlayer(id, updates) {
    const player = this.players.get(id);
    if (!player) return null;

    if (updates.position) {
      player.position = [...updates.position];

      // Check displacement from anchor for AFK detection (>5 units = real movement)
      const [ax, ay, az] = player.activityAnchor;
      const [px, py, pz] = player.position;
      const dist = Math.sqrt((px - ax) ** 2 + (py - ay) ** 2 + (pz - az) ** 2);
      if (dist > 5) {
        this._markActive(player);
      }
    }
    if (updates.velocity) player.velocity = [...updates.velocity];
    if (updates.state) player.state = updates.state;

    return player;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (player) {
      this.players.delete(id);
      console.log(`[PlayerManager] Player left: ${player.name}`);
    }
  }

  recordPlayerActivity(id) {
    const player = this.players.get(id);
    if (!player) return;
    this._markActive(player);
  }

  _markActive(player) {
    player.lastActivity = Date.now();
    player.activityAnchor = [...player.position];
    if (player.state === 'afk_warned') {
      player.state = 'alive';
      player.afkWarningToken = null;
      player.afkWarningSentAt = null;
    }
  }

  getActiveHumanCount() {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.type !== 'ai' && p.type !== 'spectator' && p.state !== 'afk_warned' && !p._disconnectedAt) count++;
    }
    return count;
  }

  getPlayers() {
    return Array.from(this.players.values());
  }
}
