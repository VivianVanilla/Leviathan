// classes.js — Player class definitions and stat system
//
// Three core stats:
//   Health  — hit points, how much punishment you take
//   Agony   — physical power, scales physical/bleed abilities
//   Essence — magic/spiritual power; max MP = floor(Essence / 2)
//
// Adding a new class: copy one entry in CLASSES and adjust.

export const CLASSES = {

  Reaper: {
    description: 'A warrior who channels raw pain into devastating strikes. Agony-focused melee.',
    color: 'c-agony',
    baseStats: {
      maxHp:   120,
      agony:    80,
      essence:  20,
      speed:     4,
    },
    abilities: ['cleave', 'warcry', 'rend'],
    sprite: {
      width: 1, height: 1,
      // Each entry = one animation frame (cycles at 400ms each)
      frames: ['@', '§', '@', '§', '@', '§', '@', '@'],
    },
  },

  Phantom: {
    description: 'A spectral caster who tears reality through Essence. Ranged, glass cannon.',
    color: 'c-essence',
    baseStats: {
      maxHp:    70,
      agony:    20,
      essence: 100,
      speed:     3,
    },
    abilities: ['void_bolt', 'blink', 'wraith_grasp'],
    sprite: {
      width: 1, height: 1,
      frames: ['%', '&', '%', '&', '%', '%', '&', '%'],
    },
  },

  Revenant: {
    description: 'Death-touched and balanced. Hybrid Agony+Essence scaling with unique soul synergies.',
    color: 'c-player',
    baseStats: {
      maxHp:    90,
      agony:    50,
      essence:  60,
      speed:     4,
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

    speed:    st.speed,
    sprite:   { ...cls.sprite, frames: [...cls.sprite.frames] },
    abilities: [...cls.abilities],

    souls:         [],   // active soul augments
    statusEffects: [],   // { type, damage?, duration, remaining }

    level: 1,
    xp:    0,

    // Soul-flag modifiers (set by souls.js apply())
    _vampireDrain: 0,
    _echoShot:     false,
    _berserker:    false,
    _lichKill:     false,
    _hollowSoul:   false,
    _voidSoul:     false,
  };
}
