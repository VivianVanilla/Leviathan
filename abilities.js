// abilities.js — Ability definitions for LEVIATHAN
//
// Ability types:  'melee' | 'projectile' | 'aoe' | 'buff' | 'teleport'
//
// damage(stats) receives the full player stats object.
// Actual scaling is defined in the damage function — that's the source of truth.
//
// Adding a new ability:
//   1. Add an entry here with a unique key
//   2. Add the key to a class's `abilities` array in classes.js

export const ABILITIES = {

  // ════════════════════════════════════════
  //    Moondrifter
  // ════════════════════════════════════════

  cleave: {
    name:        'Cleave',
    type:        'attack',
    mpCost:       0,
    description: 'Use your claws to tear. 50% Agony scaling.',
    damage:      (s) => Math.floor(s.agony * 0.5),
  },

  cryofagony: {
    name:        'CryofAgony',
    type:        'buff',
    mpCost:       8,
    description: 'Bolsters Agony by +20 for 3 turns.',
    damage:      () => 0,
    effect:      { stat: 'agony', amount: 20, duration: 3 },
  },

  rend: {
    name:        'Rend',
    type:        'melee',
    mpCost:       5,
    description: 'Deep cuts that tear. 70% Agony scaling.',
    damage:      (s) => Math.floor(12 + s.agony * 0.7),
  },

  // ════════════════════════════════════════
  //  Twinshadows  (Essence-scaled)
  // ════════════════════════════════════════

  void_bolt: {
    name:        'Void Bolt',
    type:        'projectile',
    mpCost:       6,
    description: 'A bolt of void energy. 85% Essence scaling.',
    damage:      (s) => Math.floor(10 + s.essence * 0.85),
  },

  blink: {
    name:        'Blink',
    type:        'teleport',
    mpCost:       10,
    description: 'Can\'t be used in battle.',
    damage:      () => 0,
  },

  wraith_grasp: {
    name:        'Wraith Grasp',
    type:        'projectile',
    mpCost:       8,
    description: 'Drains life — heals 40% of damage dealt. 70% Essence scaling.',
    damage:      (s) => Math.floor(8 + s.essence * 0.7),
    drain:        0.4,
  },

  // ════════════════════════════════════════
  //  REVENANT  (Hybrid Agony+Essence)
  // ════════════════════════════════════════

  soul_strike: {
    name:        'Soul Strike',
    type:        'projectile',
    mpCost:       7,
    description: 'A bolt fueled equally by pain and essence.',
    damage:      (s) => Math.floor(6 + s.agony * 0.5 + s.essence * 0.5),
  },

  drain: {
    name:        'Drain',
    type:        'melee',
    mpCost:       4,
    description: 'Siphons enemy vitality — heals 50% of damage dealt.',
    damage:      (s) => Math.floor(5 + s.agony * 0.4 + s.essence * 0.4),
    drain:        0.5,
  },

  surge: {
    name:        'Surge',
    type:        'aoe',
    mpCost:       10,
    description: 'Explosive burst of soul energy.',
    damage:      (s) => Math.floor(15 + s.agony * 0.6 + s.essence * 0.6),
  },
};

// Set of all valid ability keys — used in the battle command parser
export const ABILITY_ALIASES = new Set(Object.keys(ABILITIES));
