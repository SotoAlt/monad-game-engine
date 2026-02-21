/**
 * WorldState - Facade over focused sub-managers
 *
 * This is the source of truth for entities, physics, challenges, and players.
 * Shared between HTTP API and Colyseus game room.
 *
 * All public API is preserved — consumers access the same properties and methods.
 * Internally, work is delegated to 8 managers in src/server/managers/.
 */

import {
  EntityManager,
  PlayerManager,
  GameStateMachine,
  EnvironmentManager,
  SpellManager,
  ChatManager,
  LeaderboardManager,
  ChallengeManager,
} from './managers/index.js';

export class WorldState {
  // Static constants (backward-compat re-exports)
  static get MAX_ENTITIES() { return EntityManager.MAX_ENTITIES; }
  static get VALID_ENTITY_TYPES() { return EntityManager.VALID_ENTITY_TYPES; }
  static get VALID_GAME_TYPES() { return GameStateMachine.VALID_GAME_TYPES; }
  static get DEFAULT_PHYSICS() { return EnvironmentManager.DEFAULT_PHYSICS; }
  static get DEFAULT_ENVIRONMENT() { return EnvironmentManager.DEFAULT_ENVIRONMENT; }
  static get SPELL_TYPES() { return SpellManager.SPELL_TYPES; }
  static get SPELL_COOLDOWN() { return SpellManager.SPELL_COOLDOWN; }

  constructor() {
    // Standalone managers (no cross-manager dependencies)
    this.spellMgr = new SpellManager();
    this.chatMgr = new ChatManager();
    this.challengeMgr = new ChallengeManager();
    this.entityMgr = new EntityManager();

    // Managers with cross-manager callbacks
    this.leaderboardMgr = new LeaderboardManager(
      (id) => this.playerMgr.players.get(id)?.name
    );
    this.envMgr = new EnvironmentManager(
      () => this.gameMgr.gameState.phase
    );
    this.playerMgr = new PlayerManager(
      () => this.envMgr.respawnPoint,
      () => this.gameMgr.gameState.phase,
      () => { this.gameMgr.lobbyEnteredAt = Date.now(); }
    );
    this.gameMgr = new GameStateMachine(
      () => this.envMgr.deactivateHazardPlane(),
      () => this.clearEntities()
    );
  }

  // Property getters/setters — live references, mutations pass through

  // Entity
  get entities() { return this.entityMgr.entities; }
  get breakingPlatforms() { return this.entityMgr.breakingPlatforms; }

  // Player
  get players() { return this.playerMgr.players; }
  get onPlayerJoin() { return this.playerMgr.onPlayerJoin; }
  set onPlayerJoin(fn) { this.playerMgr.onPlayerJoin = fn; }

  // Game state machine
  get gameState() { return this.gameMgr.gameState; }
  set gameState(v) { this.gameMgr.gameState = v; }
  get lastGameType() { return this.gameMgr.lastGameType; }
  set lastGameType(v) { this.gameMgr.lastGameType = v; }
  get lastGameEndTime() { return this.gameMgr.lastGameEndTime; }
  set lastGameEndTime(v) { this.gameMgr.lastGameEndTime = v; }
  get gameHistory() { return this.gameMgr.gameHistory; }
  set gameHistory(v) { this.gameMgr.gameHistory = v; }
  get lastTemplate() { return this.gameMgr.lastTemplate; }
  set lastTemplate(v) { this.gameMgr.lastTemplate = v; }
  get lastTemplateLoadTime() { return this.gameMgr.lastTemplateLoadTime; }
  set lastTemplateLoadTime(v) { this.gameMgr.lastTemplateLoadTime = v; }
  get lobbyEnteredAt() { return this.gameMgr.lobbyEnteredAt; }
  set lobbyEnteredAt(v) { this.gameMgr.lobbyEnteredAt = v; }
  get autoStartTargetTime() { return this.gameMgr.autoStartTargetTime; }
  set autoStartTargetTime(v) { this.gameMgr.autoStartTargetTime = v; }
  get onPhaseChange() { return this.gameMgr.onPhaseChange; }
  set onPhaseChange(fn) { this.gameMgr.onPhaseChange = fn; }

  // Environment
  get physics() { return this.envMgr.physics; }
  set physics(v) { this.envMgr.physics = v; }
  get environment() { return this.envMgr.environment; }
  set environment(v) { this.envMgr.environment = v; }
  get floorType() { return this.envMgr.floorType; }
  set floorType(v) { this.envMgr.floorType = v; }
  get hazardPlane() { return this.envMgr.hazardPlane; }
  get respawnPoint() { return this.envMgr.respawnPoint; }
  set respawnPoint(v) { this.envMgr.respawnPoint = v; }

  // Spell
  get activeEffects() { return this.spellMgr.activeEffects; }
  get lastSpellCastTime() { return this.spellMgr.lastSpellCastTime; }
  set lastSpellCastTime(v) { this.spellMgr.lastSpellCastTime = v; }

  // Leaderboard
  get leaderboard() { return this.leaderboardMgr.leaderboard; }

  // Challenge
  get challenges() { return this.challengeMgr.challenges; }

  // Chat
  get messages() { return this.chatMgr.messages; }
  get announcements() { return this.chatMgr.announcements; }
  get events() { return this.chatMgr.events; }

  // Statistics (composite across managers)
  get statistics() {
    return {
      totalEntitiesCreated: this.entityMgr.totalCreated,
      totalChallengesCreated: this.challengeMgr.statistics.totalChallengesCreated,
      totalChallengesCompleted: this.challengeMgr.statistics.totalChallengesCompleted,
    };
  }
  set statistics(v) {
    if (!v) return;
    if (typeof v.totalEntitiesCreated === 'number') {
      this.entityMgr._totalCreated = v.totalEntitiesCreated;
    }
    this.challengeMgr.statistics.totalChallengesCreated = v.totalChallengesCreated || 0;
    this.challengeMgr.statistics.totalChallengesCompleted = v.totalChallengesCompleted || 0;
  }

  // Entity delegations

  spawnEntity(...args) { return this.entityMgr.spawnEntity(...args); }
  modifyEntity(...args) { return this.entityMgr.modifyEntity(...args); }
  destroyEntity(...args) { return this.entityMgr.destroyEntity(...args); }
  getEntitiesByGroup(...args) { return this.entityMgr.getEntitiesByGroup(...args); }
  destroyGroup(...args) { return this.entityMgr.destroyGroup(...args); }
  startBreaking(...args) { return this.entityMgr.startBreaking(...args); }
  processBreakingPlatforms(...args) { return this.entityMgr.processBreakingPlatforms(...args); }
  updateKinematicEntities(...args) { return this.entityMgr.updateKinematicEntities(...args); }
  getDefaultColor(...args) { return this.entityMgr.getDefaultColor(...args); }

  // Player delegations

  addPlayer(...args) { return this.playerMgr.addPlayer(...args); }
  activateSpectators() { return this.playerMgr.activateSpectators(); }
  updatePlayer(...args) { return this.playerMgr.updatePlayer(...args); }
  removePlayer(...args) { return this.playerMgr.removePlayer(...args); }
  recordPlayerActivity(...args) { return this.playerMgr.recordPlayerActivity(...args); }
  getActiveHumanCount() { return this.playerMgr.getActiveHumanCount(); }
  getPlayers() { return this.playerMgr.getPlayers(); }

  // Game state machine delegations

  startGame(...args) { return this.gameMgr.startGame(...args); }
  endGame(...args) { return this.gameMgr.endGame(...args); }
  resetGameState() { return this.gameMgr.resetGameState(); }
  startBuilding() { return this.gameMgr.startBuilding(); }
  getGameState() { return this.gameMgr.getGameState(); }
  isInCooldown() { return this.gameMgr.isInCooldown(); }
  recordWinner(...args) { return this.gameMgr.recordWinner(...args); }
  recordLoser(...args) { return this.gameMgr.recordLoser(...args); }
  setLastTemplate(...args) { return this.gameMgr.setLastTemplate(...args); }

  // Environment delegations

  setPhysics(...args) { return this.envMgr.setPhysics(...args); }
  setEnvironment(...args) { return this.envMgr.setEnvironment(...args); }
  setFloorType(...args) { return this.envMgr.setFloorType(...args); }
  setHazardPlane(...args) { return this.envMgr.setHazardPlane(...args); }
  updateHazardPlane(...args) { return this.envMgr.updateHazardPlane(...args); }
  deactivateHazardPlane() { return this.envMgr.deactivateHazardPlane(); }
  setRespawnPoint(...args) { return this.envMgr.setRespawnPoint(...args); }

  // Spell delegations

  castSpell(...args) { return this.spellMgr.castSpell(...args); }
  getActiveEffects() { return this.spellMgr.getActiveEffects(); }
  clearEffects() { return this.spellMgr.clearEffects(); }

  // Chat delegations

  addMessage(...args) { return this.chatMgr.addMessage(...args); }
  getMessages(...args) { return this.chatMgr.getMessages(...args); }
  announce(...args) { return this.chatMgr.announce(...args); }
  getAnnouncements() { return this.chatMgr.getAnnouncements(); }
  clearAnnouncements() { return this.chatMgr.clearAnnouncements(); }
  addEvent(...args) { return this.chatMgr.addEvent(...args); }
  getEvents(...args) { return this.chatMgr.getEvents(...args); }

  // Leaderboard delegations

  recordGameResult(...args) { return this.leaderboardMgr.recordGameResult(...args); }
  getLeaderboard() { return this.leaderboardMgr.getLeaderboard(); }
  loadLeaderboardFromDB() { return this.leaderboardMgr.loadLeaderboardFromDB(); }

  // Challenge delegations

  createChallenge(...args) { return this.challengeMgr.createChallenge(...args); }
  completeChallenge(...args) { return this.challengeMgr.completeChallenge(...args); }
  recordChallengeAttempt(...args) { return this.challengeMgr.recordChallengeAttempt(...args); }
  getChallenges() { return this.challengeMgr.getChallenges(); }
  getDefaultDescription(...args) { return this.challengeMgr.getDefaultDescription(...args); }

  // Orchestrated methods (facade-level logic)

  /** Full world reset — clears entities, env, spells */
  clearEntities() {
    const ids = this.entityMgr.clearEntities();
    this.envMgr.reset();
    this.spellMgr.clearEffects();
    console.log(`[WorldState] Cleared ${ids.length} entities (full reset)`);
    return ids;
  }

  /** Collects alive player positions and updates chasing entities */
  updateChasingEntities(delta) {
    return this.entityMgr.updateChasingEntities(delta, () => {
      const positions = [];
      for (const p of this.playerMgr.players.values()) {
        if (p.state === 'alive' && p.position) positions.push(p.position);
      }
      return positions;
    });
  }

  // State export (aggregates across managers)

  getState() {
    return {
      physics: { ...this.physics },
      entities: Array.from(this.entities.values()),
      players: Array.from(this.players.values()).map(p => ({
        id: p.id, name: p.name, type: p.type, position: p.position, state: p.state
      })),
      challenges: {
        active: this.getChallenges(),
        completed: Array.from(this.challenges.values()).filter(c => !c.active)
      },
      gameState: this.getGameState(),
      activeEffects: this.getActiveEffects(),
      announcements: this.getAnnouncements(),
      floorType: this.floorType,
      environment: { ...this.environment },
      hazardPlane: { ...this.hazardPlane },
      statistics: {
        ...this.statistics,
        totalEntities: this.entities.size,
        playersOnline: this.players.size
      }
    };
  }

  toJSON() {
    return JSON.stringify(this.getState(), null, 2);
  }

  fromJSON(json) {
    const data = JSON.parse(json);

    this.envMgr.physics = data.physics;

    this.entityMgr.entities.clear();
    for (const entity of data.entities) {
      this.entityMgr.entities.set(entity.id, entity);
    }

    this.challengeMgr.challenges.clear();
    for (const challenge of [...data.challenges.active, ...data.challenges.completed]) {
      this.challengeMgr.challenges.set(challenge.id, challenge);
    }

    this.statistics = data.statistics;

    console.log('[WorldState] State loaded from JSON');
  }
}
