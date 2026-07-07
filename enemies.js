// enemies.js — Enemy definitions for LEVIATHAN
//
// EXTEND: add a new entry in ENEMIES, then use spawnEnemy(key, x, y) in a MapBuilder.
//
// encounter{} fields (all optional):
//   largeSprite   — string[] rows shown in the battle screen
//   dialogue      — string[] one is chosen at random when battle starts
//   patterns      — string[] bullet pattern keys from battle.js PATTERNS (rotated each player attack)
//   dodgeDuration — ticks per dodge phase (default 90; 1 tick = 80ms ≈ 7.2s)
//   speed         — bullet velocity multiplier (default 1.0; 2.0 = twice as fast)
//   hitDamage     — HP lost by player per soul hit (default 10)
//   acceptedItems — { [itemId]: { dialogue, effect } }
//                   effect: 'spare' | 'weaken'

export const ENEMIES = {

  // ── Small enemies ────────────────────────────────────────────────────────

  hollow: {
    name:      'Hollow',
    maxHp:      30,
    xpReward:   10,
    isBoss:     false,
    sprite: {
      width: 1, height: 1,
      frames: ['h', 'H', 'h', 'H', 'h', 'H', 'h', 'H'],
    },
    encounter: {
      largeSprite: [
        '  /--\\  ',
        ' ( oo ) ',
        '  |  |  ',
        ' /----\\ ',
      ],
      dialogue: [
        '...',
        'It reaches toward you.',
        '(you hear nothing)',
        'Something stirs behind its eyes.',
      ],
      patterns:  ['scatter'],
      hitDamage:  10,
      acceptedItems: {
        bone: {
          dialogue: 'It clutches the bone and grows still. The hunger fades.',
          effect:   'spare',
        },
      },
    },
  },

  wraith: {
    name:      'Wraith',
    maxHp:      25,
    xpReward:   15,
    isBoss:     false,
    sprite: {
      width: 1, height: 1,
      frames: ['w', 'W', 'w', 'W', 'w', 'w', 'W', 'w'],
    },
    encounter: {
      largeSprite: [
        '  ~*~  ',
        ' ( * ) ',
        '  ~*~  ',
        '   |   ',
      ],
      dialogue: [
        'Turn back.',
        'You shouldn\'t be here.',
        'This place is not for the living.',
      ],
      patterns:  ['aimed', 'wave'],
      hitDamage:  12,
      acceptedItems: {
        echo_shard: {
          dialogue: 'The wraith recoils. The shard resonates with something inside it. It dissolves into silence.',
          effect:   'spare',
        },
      },
    },
  },

  shade: {
    name:      'Shade',
    maxHp:      20,
    xpReward:   12,
    isBoss:     false,
    sprite: {
      width: 1, height: 1,
      frames: ['s', 'S', 's', 'S', 's', 'S', 's', 'S'],
    },
    encounter: {
      largeSprite: [
        '  /\\  ',
        ' /><\\ ',
        ' \\  / ',
        '  \\/  ',
      ],
      dialogue: [
        '(instinct)',
        '(pure hunger)',
        '(it does not think)',
      ],
      patterns:  ['crossfire', 'rain'],
      speed:       3.0,
      hitDamage:   8,
      acceptedItems: {
        void_dust: {
          dialogue: 'The shade inhales the dust. It shudders. Then stills.',
          effect:   'spare',
        },
      },
    },
  },

  // ── Boss: The Hollow Warden ───────────────────────────────────────────────

  hollow_warden: {
    name:      'The Hollow Warden',
    maxHp:      200,
    xpReward:   250,
    isBoss:     true,
    phases: [
      { hpThreshold: 0.5, damageBoost: 1.5 },
    ],
    sprite: {
      width: 3, height: 2,
      frames: [
        ['/Ω\\', '\\_/'],
        ['/Ω\\', '\\-/'],
        ['<Ω>', '\\≡/'],
        ['/Ω\\', '\\_/'],
        ['/Ω\\', '\\-/'],
        ['/Ω\\', '\\_/'],
        ['≤Ω≥', '\\≈/'],
        ['≤Ω≥', '\\≡/'],
      ],
    },
    encounter: {
      largeSprite: [
        ' +=======+ ',
        ' | /Ω\\ | ',
        ' | \\_/ | ',
        ' +=======+ ',
        '    |||||    ',
        '   /|||||\\ ',
      ],
      dialogue: [
        'You dare...',
        'None pass. None have ever passed.',
        'I was the first to fall. I will be the last standing.',
        'Do you know what you are walking into?',
      ],
      patterns:     ['scatter', 'spiral', 'chaos'],
      dodgeDuration: 130,
      hitDamage:     15,
      acceptedItems: {
        black_salt: {
          dialogue: 'The Warden stops. A memory flickers behind its ruined eyes. "...I remember this smell. The ceremony. Before everything..." It bows slowly and steps aside.',
          effect:   'spare',
        },
        warden_key: {
          dialogue: 'The Warden stares at the key. "...You found it." Its weapon lowers. "Then you know what happened here." It steps aside.',
          effect:   'spare',
        },
      },
    },
  },

};

// ── Factory ────────────────────────────────────────────────────────────────

let _eid = 0;

export function spawnEnemy(type, x, y, id) {
  const def = ENEMIES[type];
  if (!def) throw new Error(`Unknown enemy type: "${type}"`);

  return {
    id:           id ?? `${type}_${_eid++}`,
    type,
    name:         def.name,
    x, y,
    hp:           def.maxHp,
    maxHp:        def.maxHp,
    xpReward:     def.xpReward,
    isBoss:       def.isBoss,
    phases:       def.phases ? [...def.phases] : [],
    currentPhase: 0,
    enraged:      false,
    statusEffects: [],
    encounter:    def.encounter ?? null,
    sprite: {
      width:  def.sprite.width,
      height: def.sprite.height,
      frames: [...def.sprite.frames],
    },
  };
}
