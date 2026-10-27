import { cleanKeywords } from './constants.js';
import { SCRIPT_STATUSES } from '../../shared/script-vocabulary.js';
import { isVerified, normalizeCardText } from '../script-metadata.js';

// A normalized view over Riot + custom cards and their scripts.
export class CardDB {
  constructor({ riotPayload, customCards = [], scripts = {}, settings = {}, mechanics = [] }) {
    this.payload = riotPayload;
    this.globals = riotPayload?.globals || {};
    this.customCards = customCards;
    this.scripts = scripts || {};
    this.settings = settings || {};
    this.mechanics = mechanics || [];
    this.byId = new Map();
    this.byName = new Map();
    this.rebuild();
  }

  rebuild() {
    this.byId.clear();
    this.byName.clear();
    const all = [...(this.payload?.cards || []), ...(this.customCards || [])];
    for (const card of all) {
      const merged = this.decorate(card);
      if (!merged) continue;
      this.byId.set(merged.id, merged);
      const key = merged.name.toLowerCase();
      if (!this.byName.has(key)) this.byName.set(key, []);
      this.byName.get(key).push(merged);
    }
    // Champion level-2 links: an associated non-collectible unit with the same name.
    for (const card of this.byId.values()) {
      if (card.supertype !== 'Champion' || !card.collectible) continue;
      if (card.level2Id) continue;
      const candidates = (card.associatedCardRefs || [])
        .map((id) => this.byId.get(id))
        .filter((c) => c && c.name === card.name && c.type === 'Unit' && c.supertype === 'Champion' && !c.collectible);
      const best = candidates.sort((a, b) => (b.attack + b.health) - (a.attack + a.health))[0];
      if (best) card.level2Id = best.id;
    }
    for (const card of this.byId.values()) {
      card.hasSkill = (card.associatedCardRefs || []).some((id) => {
        const associated = this.byId.get(id);
        return associated?.type === 'Ability' && (associated.rawKeywords || associated.keywords || []).includes('Skill');
      });
    }
  }

  decorate(card) {
    if (!card || !card.id) return null;
    const scriptEntry = this.scripts[card.id];
    const script = scriptEntry?.script || (scriptEntry?.triggers ? scriptEntry : null) || card.script || null;
    const hasText = !!normalizeCardText(card.text);
    let status = scriptEntry?.status;
    if (!SCRIPT_STATUSES.has(status)) {
      status = script ? 'custom' : (hasText ? 'manual' : 'none');
    }
    // The pinned payload carries scriptStatus: "none" on every card. Never let
    // that stale field hide a text card or a script. An entry that says
    // "manual" but carries a script is a local script, not an unimplemented
    // text card.
    if (script && (status === 'none' || status === 'manual')) status = 'custom';
    else if (status === 'none' && hasText) status = 'manual';
    const disabled = new Set(this.settings?.pool?.disabledCards || []);
    const disabledSets = new Set(this.settings?.pool?.disabledSets || []);
    const enabled = !disabled.has(card.id) && !disabledSets.has(card.set) && card.enabled !== false;
    const tokens = new Map((this.settings?.tokens || []).map((t) => [t.name.toLowerCase(), t]));
    return {
      ...card,
      keywords: cleanKeywords(card.keywords || card.keywordRefs || []),
      rawKeywords: card.keywords || card.keywordRefs || [],
      script,
      scriptStatus: status,
      verified: isVerified(scriptEntry, card),
      verification: scriptEntry?.verification || null,
      enabled,
      level2: card.level2Id || null,
      tokenOverrides: tokens.get(card.name.toLowerCase()) || null,
    };
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  getByName(name) {
    const list = this.byName.get(String(name).toLowerCase()) || [];
    return list[0] || null;
  }

  findToken(name, preferTeam) {
    const list = this.byName.get(String(name).toLowerCase()) || [];
    if (!list.length) return null;
    const nonCollectible = list.filter((c) => !c.collectible);
    return nonCollectible[0] || list[0];
  }

  all() {
    return [...this.byId.values()];
  }

  collectible() {
    return this.all().filter((c) => c.collectible);
  }

  enabledCards() {
    return this.collectible().filter((c) => c.enabled);
  }

  setEnabled(id, enabled) {
    const card = this.byId.get(id);
    if (!card) return false;
    const disabled = new Set(this.settings?.pool?.disabledCards || []);
    if (enabled) disabled.delete(id);
    else disabled.add(id);
    this.settings.pool = this.settings.pool || {};
    this.settings.pool.disabledCards = [...disabled];
    card.enabled = enabled;
    return true;
  }

  stats() {
    const cards = this.collectible();
    const bySet = {};
    const byRegion = {};
    const byStatus = { auto: 0, curated: 0, custom: 0, manual: 0, none: 0, partial: 0 };
    for (const c of cards) {
      bySet[c.set] = bySet[c.set] || { total: 0, enabled: 0, scripted: 0 };
      bySet[c.set].total++;
      if (c.enabled) bySet[c.set].enabled++;
      if (c.script) bySet[c.set].scripted++;
      for (const r of c.regions || []) byRegion[r] = (byRegion[r] || 0) + 1;
      byStatus[c.scriptStatus] = (byStatus[c.scriptStatus] || 0) + 1;
    }
    const textCards = cards.filter((c) => !!normalizeCardText(c.text));
    const scriptedText = textCards.filter((c) => !!c.script);
    const verified = scriptedText.filter((c) => c.verified);
    const total = cards.length;
    const text = textCards.length;
    return {
      total,
      enabled: cards.filter((c) => c.enabled).length,
      championsEnabled: cards.filter((c) => c.enabled && c.supertype === 'Champion').length,
      textCards: text,
      scripted: cards.filter((c) => !!c.script).length,
      scriptedText: scriptedText.length,
      missing: text - scriptedText.length,
      verified: verified.length,
      unverified: scriptedText.length - verified.length,
      coverage: text ? scriptedText.length / text : 0,
      verifiedCoverage: text ? verified.length / text : 0,
      bySet,
      byRegion,
      byStatus,
    };
  }
}
