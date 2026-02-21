/**
 * ArenaManager - Central registry for all live arena instances
 *
 * Manages creation, retrieval, listing, and destruction of arenas.
 * Creates a default arena on initialization.
 */

import { randomUUID } from 'crypto';
import { ArenaInstance } from './ArenaInstance.js';

const MAX_ARENAS = 20;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class ArenaManager {
  constructor() {
    this.arenas = new Map();
    this.defaultArenaId = 'default';
  }

  createDefaultArena(config = {}) {
    const arena = new ArenaInstance('default', {
      name: 'Default Arena',
      description: 'The default game arena',
      gameMasterName: 'AI Game Master',
      isDefault: true,
      ...config,
    });
    this.arenas.set('default', arena);
    console.log('[ArenaManager] Default arena created');
    return arena;
  }

  createArena(config) {
    if (this.arenas.size >= MAX_ARENAS) {
      throw new Error(`Maximum arena limit reached (${MAX_ARENAS})`);
    }

    const slug = this._slugify(config.name || 'arena');
    const suffix = randomUUID().slice(0, 4);
    const id = `${slug}-${suffix}`;
    const apiKey = `ak_${randomUUID().replace(/-/g, '')}`;

    const arena = new ArenaInstance(id, {
      ...config,
      apiKey,
    });

    this.arenas.set(id, arena);
    console.log(`[ArenaManager] Arena created: ${id} ("${arena.name}")`);

    return { arena, apiKey };
  }

  getArena(id) {
    return this.arenas.get(id) || null;
  }

  getDefaultArena() {
    return this.arenas.get(this.defaultArenaId);
  }

  getAllArenas() {
    return Array.from(this.arenas.values());
  }

  listArenas() {
    return this.getAllArenas().map(a => a.getPublicInfo());
  }

  deleteArena(id) {
    if (id === this.defaultArenaId) {
      throw new Error('Cannot delete the default arena');
    }
    const arena = this.arenas.get(id);
    if (!arena) {
      throw new Error(`Arena not found: ${id}`);
    }
    arena.dispose();
    this.arenas.delete(id);
    console.log(`[ArenaManager] Arena deleted: ${id}`);
    return true;
  }

  findByApiKey(apiKey) {
    for (const arena of this.arenas.values()) {
      if (arena.apiKey === apiKey) return arena;
    }
    return null;
  }

  findStaleArenas(maxInactiveMs = ONE_DAY_MS) {
    const now = Date.now();
    const stale = [];
    for (const arena of this.arenas.values()) {
      if (arena.isDefault) continue;
      if (arena.worldState.players.size > 0) continue;
      if (now - arena.lastActive > maxInactiveMs) {
        stale.push(arena.id);
      }
    }
    return stale;
  }

  loadFromDB(rows) {
    let loaded = 0;
    for (const row of rows) {
      if (row.id === this.defaultArenaId) continue;

      const config = {
        name: row.name,
        description: row.description || '',
        creatorId: row.creator_id,
        apiKey: row.api_key,
        gameMasterName: row.game_master_name || 'Game Master',
        isDefault: row.is_default || false,
        upvotes: row.upvotes || 0,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        ...(row.config || {}),
      };

      const arena = new ArenaInstance(row.id, config);
      this.arenas.set(row.id, arena);
      loaded++;
    }

    if (loaded > 0) {
      console.log(`[ArenaManager] Loaded ${loaded} arenas from DB`);
    }
  }

  _slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'arena';
  }
}
