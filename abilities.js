// abilities.js — Ability definitions with stat scaling
//
// Ability types:  'melee' | 'projectile' | 'aoe' | 'buff' | 'teleport'
//
// Adding a new ability:
//   1. Add an entry here with a unique key
//   2. Add the key to a class's `abilities` array in classes.js
//   3. That's it — the engine handles everything else.
//
// damage(stats) receives the full player stats object.
// scaling{} is purely informational (displayed in the abilities list).

export const ABILITIES = {

  // ════════════════════════════════════════
  //  REAPER  (Agony-scaled)
  // ════════════════════════════════════════

  cleave: {
    name:        'Cleave',
    type:        'aoe',
    mpCost:       0,
    range:        1,
    description: 'Sweeping blow that hits all adjacent enemies.',
    projChar:    '/',
    projColor:   'c-agony',
    damage:      (s) => Math.floor(8 + s.agony * 0.9),
    scaling:     { agony: 0.9 },
  },

  warcry: {
    name:        'War Cry',
    type:        'buff',
    mpCost:       8,
    range:        0,
    description: 'Bolsters Agony by +20 for 3 turns.',
    damage:      () => 0,
    scaling:     {},
    effect:      { stat: 'agony', amount: 20, duration: 3 },
  },

  rend: {
    name:        'Rend',
    type:        'melee',
    mpCost:       5,
    range:        1,
    description: 'Deep cuts that inflict bleeding (3 turns).',
    projChar:    '\\',
    projColor:   'c-agony',
    damage:      (s) => Math.floor(12 + s.agony * 0.7),
    scaling:     { agony: 0.7 },
    bleed:        3,
  },

  // ════════════════════════════════════════
  //  PHANTOM  (Essence-scaled)
  // ════════════════════════════════════════

  void_bolt: {
    name:        'Void Bolt',
    type:        'projectile',
    mpCost:       6,
    range:        8,
    description: 'A bolt of void energy fired in a line.',
    projChar:    '*',
    projColor:   'c-essence',
    damage:      (s) => Math.floor(10 + s.essence * 0.85),
    scaling:     { essence: 0.85 },
  },

  blink: {
    name:        'Blink',
    type:        'teleport',
    mpCost:       10,
    range:        5,
    description: 'Teleport to any floor tile within range. Usage: blink <x> <y>',
    damage:      () => 0,
    scaling:     {},
  },

  wraith_grasp: {
    name:        'Wraith Grasp',
    type:        'projectile',
    mpCost:       8,
    range:        4,
    description: 'Spectral hands drain life — heals 40% of damage dealt.',
    projChar:    '~',
    projColor:   'c-essence',
    damage:      (s) => Math.floor(8 + s.essence * 0.7),
    scaling:     { essence: 0.7 },
    drain:        0.4,
  },

  // ════════════════════════════════════════
  //  REVENANT  (Hybrid Agony+Essence)
  // ════════════════════════════════════════

  soul_strike: {
    name:        'Soul Strike',
    type:        'projectile',
    mpCost:       7,
    range:        5,
    description: 'A bolt fueled equally by pain and essence.',
    projChar:    '§',
    projColor:   'c-player',
    damage:      (s) => Math.floor(6 + s.agony * 0.5 + s.essence * 0.5),
    scaling:     { agony: 0.5, essence: 0.5 },
  },

  drain: {
    name:        'Drain',
    type:        'melee',
    mpCost:       4,
    range:        1,
    description: 'Siphon enemy vitality — heals 50% of damage dealt.',
    projChar:    'Ø',
    projColor:   'c-player',
    damage:      (s) => Math.floor(5 + s.agony * 0.4 + s.essence * 0.4),
    scaling:     { agony: 0.4, essence: 0.4 },
    drain:        0.5,
  },

  surge: {
    name:        'Surge',
    type:        'aoe',
    mpCost:       10,
    range:        1,
    description: 'Explosive burst of soul energy — hits all adjacent enemies.',
    projChar:    '!',
    projColor:   'c-boss',
    damage:      (s) => Math.floor(15 + s.agony * 0.6 + s.essence * 0.6),
    scaling:     { agony: 0.6, essence: 0.6 },
  },
};

// Convenience: ability keys that are valid "direct" commands
// (so player can type the ability name without "cast")
export const ABILITY_ALIASES = new Set(Object.keys(ABILITIES));
