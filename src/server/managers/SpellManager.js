import { randomUUID } from 'crypto';
import { SPELL_TYPES, SPELL_COOLDOWN } from '../../shared/constants.js';

export class SpellManager {
  static SPELL_COOLDOWN = SPELL_COOLDOWN;
  static SPELL_TYPES = SPELL_TYPES;

  constructor() {
    this.activeEffects = [];
    this.lastSpellCastTime = 0;
  }

  castSpell(spellType, duration) {
    const spellDef = SpellManager.SPELL_TYPES[spellType];
    if (!spellDef) {
      throw new Error(`Unknown spell: ${spellType}. Available: ${Object.keys(SpellManager.SPELL_TYPES).join(', ')}`);
    }

    const now = Date.now();
    const timeSinceLast = now - this.lastSpellCastTime;
    if (timeSinceLast < SpellManager.SPELL_COOLDOWN) {
      const remaining = Math.ceil((SpellManager.SPELL_COOLDOWN - timeSinceLast) / 1000);
      throw new Error(`Spell on cooldown! The magic needs ${remaining}s to recharge.`);
    }

    const id = `spell-${randomUUID().slice(0, 8)}`;
    const spell = {
      id,
      type: spellType,
      name: spellDef.name,
      duration: duration || spellDef.defaultDuration,
      startTime: now
    };

    this.activeEffects.push(spell);
    this.lastSpellCastTime = now;
    console.log(`[SpellManager] Spell cast: ${spellDef.name} for ${spell.duration}ms`);
    return spell;
  }

  getActiveEffects() {
    const now = Date.now();
    this.activeEffects = this.activeEffects.filter(e => now - e.startTime < e.duration);
    return [...this.activeEffects];
  }

  clearEffects() {
    this.activeEffects = [];
    console.log('[SpellManager] All effects cleared');
  }
}
