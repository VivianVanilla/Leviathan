// classes.js — Player class definitions and stat system
//
// Three core stats:
//   Health  — hit points, how much punishment you take
//   Agony   — physical power, scales physical abilities
//   Essence — magic/spiritual power; max MP = floor(Essence / 2)
//
// Adding a new class: copy one entry in CLASSES and adjust.

export const CLASSES = {

  Moondrifter: {
    description: 'The draconic Amalgam of the Moon. Large HP, medium agony and low essence.',
    color: 'c-agony',
    baseStats: {
      maxHp:   80,
      agony:    20,
      essence:  10,
    },
    abilities: ['cleave', 'cryofagony', 'rend'],
    sprite: {
      width: 1, height: 1,
      // Each entry = one animation frame (cycles at 400ms each)
      frames: ['@', '§', '@', '§', '@', '§', '@', '@'],
    },
  },

  Twinshadows: {
    description: 'Twin spirits with low agony and high essence. They constantly fight.',
    color: 'c-essence',
    baseStats: {
      maxHp:    50,
      agony:    10,
      essence: 80,
    },
    abilities: ['void_bolt', 'blink', 'wraith_grasp'],
    sprite: {
      width: 1, height: 1,
      frames: ['%Y', '&X', '%Y', '&X', '%Y', '%X', '&Y', '%X'],
    },
  },

  Tempest: {
    description: 'The reaper of the ocean. Low HP, high agony and high essence.',
    color: 'c-player',
    baseStats: {
      maxHp:    20,
      agony:    80,
      essence:  80,
    },
    abilities: ['soul_strike', 'drain', 'surge'],
    sprite: {
      width: 1, height: 1,
      frames: ['Ψ', 'ψ', 'Ψ', 'ψ', 'Ψ', 'Ψ', 'ψ', 'Ψ'],
    },
  },

};

// ── Factory ────────────────────────────────────────────────────────────────

export function createPlayer(className, name = 'Unknown') {
  const cls = CLASSES[className];
  if (!cls) throw new Error(`Unknown class: ${className}`);

  const st = cls.baseStats;
  const maxMp = Math.floor(st.essence / 2);

  return {
    name,
    class:    className,
    x: 0, y: 0,

    maxHp:    st.maxHp,
    hp:       st.maxHp,
    agony:    st.agony,
    essence:  st.essence,

    get maxMp() { return Math.floor(this.essence / 2); },
    mp:       maxMp,

    sprite:   { ...cls.sprite, frames: [...cls.sprite.frames] },
    abilities: [...cls.abilities],

    statusEffects: [],   // { type, damage?, duration, remaining }
    inventory:     [],   // items carried (picked up from world, used in battle)

    level: 1,
    xp:    0,
    maxXp: 100,
  };
}
