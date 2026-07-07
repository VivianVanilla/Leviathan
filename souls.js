// souls.js — Roguelike soul augments (earned by defeating bosses)
//
// Adding a soul:
//   1. Add an entry to SOUL_POOL
//   2. Set apply(player) to mutate the player's flags or stats
//   3. It will automatically appear in future boss-kill offerings

export const SOUL_POOL = [

  // ── Common ──────────────────────────────────────────────────────────────

  {
    id: 'soul_iron', name: 'Iron Soul', rarity: 'common',
    description: '+25 Agony.',
    apply: (p) => { p.agony += 25; },
  },
  {
    id: 'soul_ether', name: 'Ether Soul', rarity: 'common',
    description: '+30 Essence. +15 max MP.',
    apply: (p) => { p.essence += 30; p.mp = Math.min(p.mp + 15, p.maxMp); },
  },
  {
    id: 'soul_vital', name: 'Vital Soul', rarity: 'common',
    description: '+35 max HP.',
    apply: (p) => { p.maxHp += 35; p.hp += 35; },
  },
  {
    id: 'soul_swift', name: 'Swift Soul', rarity: 'common',
    description: '+1 Speed (more tiles per turn).',
    apply: (p) => { p.speed += 1; },
  },
  {
    id: 'soul_mend', name: 'Mending Soul', rarity: 'common',
    description: 'Restore 30 HP immediately.',
    apply: (p) => { p.hp = Math.min(p.maxHp, p.hp + 30); },
  },

  // ── Rare ────────────────────────────────────────────────────────────────

  {
    id: 'soul_vampire', name: 'Vampire Soul', rarity: 'rare',
    description: 'All abilities drain 20% of damage dealt as HP.',
    apply: (p) => { p._vampireDrain += 0.2; },
  },
  {
    id: 'soul_echo', name: 'Echo Soul', rarity: 'rare',
    description: 'Projectile abilities fire twice (second hit deals 50% damage).',
    apply: (p) => { p._echoShot = true; },
  },
  {
    id: 'soul_berserker', name: 'Berserker Soul', rarity: 'rare',
    description: 'Effective Agony +1 for every 10 HP missing when dealing damage.',
    apply: (p) => { p._berserker = true; },
  },
  {
    id: 'soul_surge', name: 'Surging Soul', rarity: 'rare',
    description: '+20 Agony and +20 Essence.',
    apply: (p) => { p.agony += 20; p.essence += 20; },
  },

  // ── Epic ────────────────────────────────────────────────────────────────

  {
    id: 'soul_lich', name: 'Lich Soul', rarity: 'epic',
    description: 'On kill, restore 8 MP.',
    apply: (p) => { p._lichKill = true; },
  },
  {
    id: 'soul_hollow', name: 'Hollow Soul', rarity: 'epic',
    description: 'No MP costs. All ability damage -20%.',
    apply: (p) => { p._hollowSoul = true; },
  },
  {
    id: 'soul_blade', name: 'Blade Soul', rarity: 'epic',
    description: '+50 Agony. -15 Essence.',
    apply: (p) => { p.agony += 50; p.essence = Math.max(0, p.essence - 15); },
  },

  // ── Legendary ───────────────────────────────────────────────────────────

  {
    id: 'soul_void', name: 'Void Soul', rarity: 'legendary',
    description: '+60% damage vs bosses. -25% damage vs normal enemies.',
    apply: (p) => { p._voidSoul = true; },
  },
  {
    id: 'soul_leviathan', name: 'Leviathan\'s Soul', rarity: 'legendary',
    description: '+40 Agony, +40 Essence, +20 max HP, +1 Speed.',
    apply: (p) => { p.agony += 40; p.essence += 40; p.maxHp += 20; p.hp += 20; p.speed += 1; },
  },

];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getRandomSouls(count = 3, excludeIds = []) {
  const pool = SOUL_POOL.filter(s => !excludeIds.includes(s.id));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function applySoul(player, soulId) {
  const soul = SOUL_POOL.find(s => s.id === soulId);
  if (!soul) return null;
  soul.apply(player);
  player.souls.push(soul);
  return soul;
}
