// map.js — Map definition system for LEVIATHAN
// Two ways to make a map:
//   1. MapBuilder fluent API  (programmatic rooms, walls, etc.)
//   2. MapBuilder.fromString(str)  (paint with ASCII — S=start, # wall, . floor)

export class MapDefinition {
  constructor(width, height, tiles, spawns) {
    this.width  = width;
    this.height = height;
    this.tiles  = tiles;   // flat char array, row-major
    this.spawns = spawns;  // { player:{x,y}, enemies:[{type,x,y}], bosses:[{type,x,y}] }
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
    return t === '.' || t === '+';
  }
}

export class MapBuilder {
  constructor(width, height) {
    this.width  = width;
    this.height = height;
    this.tiles  = new Array(width * height).fill('.');
    this.spawns = { player: null, enemies: [], bosses: [] };
    // Default: solid border walls
    this._fillRect(0, 0, width, 1, '#');
    this._fillRect(0, height - 1, width, 1, '#');
    this._fillRect(0, 0, 1, height, '#');
    this._fillRect(width - 1, 0, 1, height, '#');
  }

  // ── TILE OPS ──────────────────────────────────────────────────────────────

  set(x, y, ch) {
    this.tiles[y * this.width + x] = ch;
    return this;
  }

  // Fill a rectangle of a tile character
  fillRect(x, y, w, h, ch) {
    this._fillRect(x, y, w, h, ch);
    return this;
  }

  _fillRect(x, y, w, h, ch) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        if (x + dx >= 0 && x + dx < this.width && y + dy >= 0 && y + dy < this.height)
          this.tiles[(y + dy) * this.width + (x + dx)] = ch;
  }

  // Draw a closed room (walls on perimeter, floor inside)
  room(x, y, w, h) {
    this._fillRect(x, y, w, h, '#');
    this._fillRect(x + 1, y + 1, w - 2, h - 2, '.');
    return this;
  }

  // Horizontal / vertical wall segments
  hwall(x, y, len) { return this.fillRect(x, y, len, 1, '#'); }
  vwall(x, y, len) { return this.fillRect(x, y, 1, len, '#'); }

  // Place a door tile
  door(x, y) { return this.set(x, y, '+'); }

  // Fill an area with water/hazard
  water(x, y, w, h) { return this.fillRect(x, y, w, h, '~'); }

  // Open floor corridor
  corridor(x, y, w, h) { return this.fillRect(x, y, w, h, '.'); }

  // ── SPAWNS ────────────────────────────────────────────────────────────────

  spawnPlayer(x, y) { this.spawns.player = { x, y }; return this; }
  spawnEnemy(type, x, y) { this.spawns.enemies.push({ type, x, y }); return this; }
  spawnBoss(type, x, y)  { this.spawns.bosses.push({ type, x, y }); return this; }

  // ── PARSE FROM STRING ────────────────────────────────────────────────────
  // Special chars:
  //   S = player start (becomes floor)
  //   E = enemy spawn marker (becomes floor) — define type separately
  //   # . + ~ = normal tiles

  static fromString(str, enemyMap = {}) {
    const lines = str.replace(/\t/g, '  ').split('\n');
    const h = lines.length;
    const w = Math.max(...lines.map(l => l.length));

    const builder = new MapBuilder(w, h);
    builder.tiles = new Array(w * h).fill('.');
    builder.spawns = { player: null, enemies: [], bosses: [] };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = lines[y]?.[x] ?? ' ';
        if (ch === 'S') {
          builder.spawns.player = { x, y };
          builder.tiles[y * w + x] = '.';
        } else if (ch === ' ') {
          builder.tiles[y * w + x] = '#';
        } else {
          builder.tiles[y * w + x] = ch;
        }
      }
    }

    // Place enemies/bosses from the supplied map { key: {type, isBoss} }
    for (const [posKey, def] of Object.entries(enemyMap)) {
      const [ex, ey] = posKey.split(',').map(Number);
      if (def.isBoss) builder.spawns.bosses.push({ type: def.type, x: ex, y: ey });
      else            builder.spawns.enemies.push({ type: def.type, x: ex, y: ey });
    }

    return builder;
  }

  // ── BUILD ─────────────────────────────────────────────────────────────────

  build() {
    if (!this.spawns.player) this.spawns.player = { x: 2, y: 2 };
    return new MapDefinition(this.width, this.height, [...this.tiles], this.spawns);
  }
}

// ── PREDEFINED LEVELS ─────────────────────────────────────────────────────
// Add more levels here. Each level is a function that returns a MapDefinition.

export const LEVELS = {
  1: buildLevel1,
};

function buildLevel1() {
  return new MapBuilder(72, 26)
    // Entry chamber
    .room(0, 0, 24, 13)
    .door(23, 6)
    // Hall east
    .corridor(23, 5, 6, 3)
    // Central chamber
    .room(28, 0, 20, 15)
    .door(47, 6)
    // Approach corridor
    .corridor(47, 5, 5, 3)
    // Boss arena
    .room(51, 0, 21, 26)
    .water(56, 18, 7, 5)
    // Lower dungeon (south of entry)
    .room(0, 13, 30, 13)
    .door(16, 13)
    // Lower east wing
    .room(29, 15, 23, 11)
    .door(35, 15)
    // Spawns — first hollow is close enough to immediately detect the player
    .spawnPlayer(3, 6)
    .spawnEnemy('hollow', 8, 5)
    .spawnEnemy('hollow', 15, 9)
    .spawnEnemy('wraith', 35, 5)
    .spawnEnemy('wraith', 42, 11)
    .spawnEnemy('shade',  8, 19)
    .spawnEnemy('shade', 18, 21)
    .spawnEnemy('hollow', 22, 23)
    .spawnBoss('hollow_warden', 58, 7)
    .build();
}
