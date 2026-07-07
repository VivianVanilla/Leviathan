// enemies.js — Enemy and boss definitions
//
// Adding a new enemy:
//   1. Add a definition object in ENEMIES with a unique key
//   2. Use spawnEnemy(key, x, y) in your level's MapBuilder calls
//
// Multi-tile sprites: set sprite.width > 1 or sprite.height > 1.
//   frames is an array of animation frames.
//   Each frame is an array of strings, one per row.
//   String length should equal sprite.width.
//
// AI behaviors:
//   'walker'      — moves toward player, melee attacks
//   'charger'     — fast walker
//   'shooter'     — maintains range, fires projectiles
//   'boss_warden' — alternates charges with ranged volleys; enrages at 50% HP

export const ENEMIES = {

  // ── Small enemies ────────────────────────────────────────────────────────

  hollow: {
    name:     'Hollow',
    maxHp:     25,
    agony:     15,
    essence:    0,
    speed:      2,
    sight:      8,
    behavior:  'walker',
    attackRange: 1,
    attackDamage: (s) => Math.floor(4 + s.agony * 0.6),
    xpReward:  10,
    isBoss:    false,
    sprite: {
      width: 1, height: 1,
      frames: ['h', 'H', 'h', 'H', 'h', 'H', 'h', 'H'],
    },
  },

  wraith: {
    name:     'Wraith',
    maxHp:     20,
    agony:      5,
    essence:   30,
    speed:      3,
    sight:     10,
    behavior:  'shooter',
    attackRange: 5,
    projChar:  '*',
    attackDamage: (s) => Math.floor(6 + s.essence * 0.5),
    xpReward:  15,
    isBoss:    false,
    sprite: {
      width: 1, height: 1,
      frames: ['w', 'W', 'w', 'W', 'w', 'w', 'W', 'w'],
    },
  },

  shade: {
    name:     'Shade',
    maxHp:     15,
    agony:     20,
    essence:    0,
    speed:      5,
    sight:     12,
    behavior:  'charger',
    attackRange: 1,
    attackDamage: (s) => Math.floor(5 + s.agony * 0.5),
    xpReward:  12,
    isBoss:    false,
    sprite: {
      width: 1, height: 1,
      frames: ['s', 'S', 's', 'S', 's', 'S', 's', 'S'],
    },
  },

  // ── Boss: The Hollow Warden (3 wide × 2 tall) ────────────────────────────
  //
  //  Frame layout per row: "/Ω\" on top, "\_/" on bottom
  //  The Warden enrages at 50% HP: +1 speed, ×1.5 damage

  hollow_warden: {
    name:     'The Hollow Warden',
    maxHp:    200,
    agony:     60,
    essence:   40,
    speed:      2,
    sight:     20,
    behavior:  'boss_warden',
    attackRange: 2,
    projChar:  '≈',
    attackDamage: (s) => Math.floor(20 + s.agony * 0.8),
    xpReward:  250,
    isBoss:    true,
    phases: [
      { hpThreshold: 0.5, speedBoost: 1, damageBoost: 1.5 },
    ],
    sprite: {
      width: 3, height: 2,
      frames: [
        ['/Ω\\', '\\_/'],   // idle A
        ['/Ω\\', '\\-/'],   // idle B
        ['<Ω>', '\\≡/'],    // attack windup
        ['/Ω\\', '\\_/'],   // idle A again
        ['/Ω\\', '\\-/'],   // idle B
        ['/Ω\\', '\\_/'],   // idle A
        ['≤Ω≥', '\\≈/'],    // enraged
        ['≤Ω≥', '\\≡/'],   // enraged attack
      ],
    },
  },

};

// ── Factory ────────────────────────────────────────────────────────────────

let _eid = 0;

export function spawnEnemy(type, x, y, id) {
  const def = ENEMIES[type];
  if (!def) throw new Error(`Unknown enemy type: ${type}`);

  return {
    id:           id ?? `${type}_${_eid++}`,
    type,
    name:         def.name,
    x, y,

    hp:           def.maxHp,
    maxHp:        def.maxHp,
    agony:        def.agony,
    essence:      def.essence,
    speed:        def.speed,

    sight:        def.sight,
    behavior:     def.behavior,
    attackRange:  def.attackRange,
    attackDamage: def.attackDamage,
    projChar:     def.projChar ?? '·',
    xpReward:     def.xpReward,
    isBoss:       def.isBoss,

    phases:       def.phases ? [...def.phases] : [],
    currentPhase: 0,
    enraged:      false,

    statusEffects: [],
    sprite: {
      width:  def.sprite.width,
      height: def.sprite.height,
      frames: [...def.sprite.frames],
    },
  };
}
