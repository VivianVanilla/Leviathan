// map.js — Map definition + builder for LEVIATHAN
//
// ── Quick-start: define a level with ASCII art ────────────────────────────────
//
//   MapBuilder.fromString(asciiStr, opts)
//     opts.enemies  { [char]: { type, isBoss? } }  — inline enemy codes
//     opts.items    { [char]: itemId }              — inline item codes
//     Then chain .exit() / .trigger() and finish with .build()
//
// ASCII map characters:
//   #   wall         .  floor       +  door (passable)
//   >   exit tile    ~  water       S  player start
//   Any char in opts.enemies or opts.items is replaced with floor + spawns
//
// ── Fluent builder API ────────────────────────────────────────────────────────
//   .room(x,y,w,h)               walled room, open interior
//   .corridor(x,y,w,h)           open passable corridor
//   .hwall(x,y,len)              horizontal wall segment
//   .vwall(x,y,len)              vertical wall segment
//   .door(x,y)                   door tile (+)
//   .water(x,y,w,h)              hazard tiles (~)
//   .spawnPlayer(x,y)
//   .spawnEnemy(type,x,y)
//   .spawnBoss(type,x,y)
//   .spawnItem(id,x,y)           floor item (✦, auto-pickup on step)
//   .trigger(x,y,def)            invisible trigger; def: {message, itemId?, once?}
//   .exit(x,y,toLevel,toX,toY)  transition tile (>)
//   .preview()                   → ASCII string (console.log for debugging)
//   .build()                     → MapDefinition

export class MapDefinition {
  constructor(width, height, tiles, spawns) {
    this.width  = width;
    this.height = height;
    this.tiles  = tiles;   // flat char array, row-major
    this.spawns = spawns;
  }

  getTile(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return '#';
    return this.tiles[y * this.width + x] || '#';
  }

  setTile(x, y, ch) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.tiles[y * this.width + x] = ch;
  }

  isPassable(x, y) {
    const t = this.getTile(x, y);
    return t === '.' || t === '+' || t === '>';
  }

  // Returns an ASCII string of the current tile grid — useful for debugging
  preview() {
    const rows = [];
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) row += this.getTile(x, y);
      rows.push(row);
    }
    return rows.join('\n');
  }
}

export class MapBuilder {
  constructor(width, height, _skipBorderWalls = false) {
    this.width  = width;
    this.height = height;
    this.tiles  = new Array(width * height).fill('.');
    this.spawns = { player: null, enemies: [], bosses: [], items: [], triggers: [], exits: [] };
    if (!_skipBorderWalls) {
      this._fillRect(0, 0, width, 1, '#');
      this._fillRect(0, height - 1, width, 1, '#');
      this._fillRect(0, 0, 1, height, '#');
      this._fillRect(width - 1, 0, 1, height, '#');
    }
  }

  // ── Tile ops ──────────────────────────────────────────────────────────────

  set(x, y, ch)             { this.tiles[y * this.width + x] = ch; return this; }
  fillRect(x, y, w, h, ch)  { this._fillRect(x, y, w, h, ch); return this; }

  _fillRect(x, y, w, h, ch) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx, ty = y + dy;
        if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height)
          this.tiles[ty * this.width + tx] = ch;
      }
  }

  room(x, y, w, h) {
    this._fillRect(x, y, w, h, '#');
    this._fillRect(x + 1, y + 1, w - 2, h - 2, '.');
    return this;
  }

  hwall(x, y, len)    { return this.fillRect(x, y, len, 1, '#'); }
  vwall(x, y, len)    { return this.fillRect(x, y, 1, len, '#'); }
  door(x, y)          { return this.set(x, y, '+'); }
  water(x, y, w, h)   { return this.fillRect(x, y, w, h, '~'); }
  corridor(x, y, w, h){ return this.fillRect(x, y, w, h, '.'); }

  // ── Spawns ────────────────────────────────────────────────────────────────

  spawnPlayer(x, y)      { this.spawns.player = { x, y }; return this; }
  spawnEnemy(type, x, y) { this.spawns.enemies.push({ type, x, y }); return this; }
  spawnBoss(type, x, y)  { this.spawns.bosses.push({ type, x, y }); return this; }
  spawnItem(id, x, y)    { this.spawns.items.push({ id, x, y }); return this; }

  trigger(x, y, def) {
    this.spawns.triggers.push({ x, y, ...def, once: def.once ?? true });
    return this;
  }

  exit(x, y, toLevel, toX, toY) {
    this.set(x, y, '>');
    this.spawns.exits.push({ x, y, toLevel, toX, toY });
    return this;
  }

  // Returns an ASCII string of the current tile grid — call console.log(b.preview()) while designing
  preview() {
    const rows = [];
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) row += this.tiles[y * this.width + x] || ' ';
      rows.push(row);
    }
    return rows.join('\n');
  }

  // ── Parse from ASCII string ───────────────────────────────────────────────
  //
  // opts.enemies  { [char]: { type, isBoss? } }
  // opts.items    { [char]: itemId }
  //
  // Special chars: S=player start  ' '(space)=#  >=exit tile  +=door  ~=water
  // Any char in opts.enemies or opts.items is replaced with '.' and registered.

  static fromString(str, opts = {}) {
    const enemyChars = opts.enemies ?? {};
    const itemChars  = opts.items  ?? {};

    const lines = str.trim().replace(/\r/g, '').split('\n');
    const h = lines.length;
    const w = Math.max(...lines.map(l => l.length));

    const builder = new MapBuilder(w, h, /* _skipBorderWalls */ true);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = lines[y]?.[x] ?? ' ';

        if (ch === 'S') {
          builder.spawns.player = { x, y };
          builder.tiles[y * w + x] = '.';

        } else if (ch === ' ') {
          builder.tiles[y * w + x] = '#';

        } else if (enemyChars[ch]) {
          const def = enemyChars[ch];
          if (def.isBoss) builder.spawns.bosses.push({ type: def.type, x, y });
          else            builder.spawns.enemies.push({ type: def.type, x, y });
          builder.tiles[y * w + x] = '.';

        } else if (itemChars[ch]) {
          builder.spawns.items.push({ id: itemChars[ch], x, y });
          builder.tiles[y * w + x] = '.';

        } else {
          builder.tiles[y * w + x] = ch;
        }
      }
    }

    return builder;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  build() {
    if (!this.spawns.player) this.spawns.player = { x: 2, y: 2 };
    return new MapDefinition(this.width, this.height, [...this.tiles], this.spawns);
  }
}

// ── Level registry ────────────────────────────────────────────────────────────
// EXTEND: add new levels as builder functions and register in LEVELS.

export const LEVELS = {
  1: buildLevel1,
};

// ─────────────────────────────────────────────────────────────────────────────
// Level 1 — The Descent
//
// Three chambers separated by walled corridors.
// Read the ASCII map below — what you see is exactly what gets built.
//
// Char codes used here:
//   h  Hollow enemy    w  Wraith enemy    s  Shade enemy    W  Hollow Warden (boss)
//   1  bone item       2  echo_shard      >  level exit
//
// Room A (left)   Room B (center)   Room C (boss arena, right)
// ─────────────────────────────────────────────────────────────
function buildLevel1() {
  return MapBuilder.fromString(
`##################################################
#.................#................#.............#
#..S.......h......#....w......w....#.............#
#.................#................#.............#
#.................#................#......W......#
#.................#................#.............#
#.................+................+.............#
#.................#................#.............#
#.....s...........#................#.............#
#.................#....s...........#.............#
#...1.............#................#.............#
#.................#................#....2........#
#.................#................#..........>..#
##################################################`,
    {
      enemies: {
        h: { type: 'hollow' },
        w: { type: 'wraith' },
        s: { type: 'shade'  },
        W: { type: 'hollow_warden', isBoss: true },
      },
      items: {
        '1': 'bone',
        '2': 'echo_shard',
      },
    }
  )
  // Register the exit destination (tile '>' is already placed by the ASCII map)
  .exit(46, 12, 1, 3, 2)   // loops back to level 1 entry for now

  // Lore triggers
  .trigger(1, 1, {
    message: 'A worn inscription: "This place was sealed for a reason. Turn back."',
    once: true,
  })
  .trigger(19, 1, {
    message: 'The air grows colder. You hear distant footsteps.',
    once: true,
  })
  .trigger(36, 1, {
    message: 'The air changes. Something ancient breathes nearby.',
    once: false,
  })
  .trigger(1, 8, {
    message: 'Scratch marks on the floor — small, repeated. Someone was counting days.',
    once: true,
  })
  .build();
}
