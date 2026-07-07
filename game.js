// game.js — GameEngine: overworld, world events, and command routing for LEVIATHAN

import { Renderer }                    from './renderer.js';
import { LEVELS }                       from './map.js';
import { createPlayer, CLASSES }        from './classes.js';
import { ABILITIES, ABILITY_ALIASES }   from './abilities.js';
import { spawnEnemy }                   from './enemies.js';
import { ITEMS }                        from './items.js';
import { BattleSystem }                 from './battle.js';

const SAVE_KEY = 'leviathan_save';

// ── GameEngine ────────────────────────────────────────────────────────────────

class GameEngine {
  constructor(renderer) {
    this.renderer = renderer;
    this.state    = null;
    this.battle   = new BattleSystem(this);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  init(className, playerName) {
    const player = createPlayer(className, playerName);

    this.state = {
      currentLevel: 1,
      map:          null,
      player,
      entities:     [],
      floorItems:   [],
      triggers:     null,
      exits:        null,
      turn:         1,
      phase:        'player',
      pendingLevelUp: [],
      trail:        [],
      battle:       null,
    };

    this._loadLevel(1, null, null, /* initial */ true);
  }

  getState() { return this.state; }

  // ── LocalStorage save/load ────────────────────────────────────────────────

  saveGame() {
    const s = this.state;
    const p = s.player;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version:      1,
        currentLevel: s.currentLevel,
        player: {
          name:          p.name,
          class:         p.class,
          level:         p.level,
          hp:            p.hp,
          maxHp:         p.maxHp,
          mp:            p.mp,
          agony:         p.agony,
          essence:       p.essence,
          xp:            p.xp,
          maxXp:         p.maxXp,
          abilities:     p.abilities,
          inventory:     p.inventory,
          statusEffects: p.statusEffects,
          x:             p.x,
          y:             p.y,
        },
      }));
    } catch (_) {}
  }

  static loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  static clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  }

  _applySave(save) {
    const s  = this.state;
    const p  = s.player;
    const sp = save.player;
    Object.assign(p, {
      level:         sp.level,
      hp:            sp.hp,
      maxHp:         sp.maxHp,
      mp:            sp.mp,
      agony:         sp.agony,
      essence:       sp.essence,
      xp:            sp.xp,
      maxXp:         sp.maxXp,
      abilities:     sp.abilities,
      inventory:     sp.inventory,
      statusEffects: sp.statusEffects,
    });
    if (save.currentLevel !== 1) {
      this._loadLevel(save.currentLevel, sp.x, sp.y);
    } else {
      p.x = sp.x;
      p.y = sp.y;
    }
  }

  // ── Level loading ─────────────────────────────────────────────────────────

  _loadLevel(levelId, toX, toY, isInit = false) {
    const s      = this.state;
    const mapDef = LEVELS[levelId]?.();
    if (!mapDef) { this._log(`Unknown level ${levelId}.`, 'warn'); return; }

    let eid = 0;
    s.map          = mapDef;
    s.currentLevel = levelId;
    s.entities     = [
      ...mapDef.spawns.enemies.map(sp => spawnEnemy(sp.type, sp.x, sp.y, `e${eid++}`)),
      ...mapDef.spawns.bosses.map(sp  => spawnEnemy(sp.type, sp.x, sp.y, `b${eid++}`)),
    ];
    s.floorItems = mapDef.spawns.items.map(it => ({ ...it }));
    s.triggers   = new Map(mapDef.spawns.triggers.map(t => [`${t.x},${t.y}`, { ...t }]));
    s.exits      = new Map(mapDef.spawns.exits.map(e    => [`${e.x},${e.y}`, { ...e }]));
    s.trail      = [];

    if (isInit) {
      s.player.x = mapDef.spawns.player.x;
      s.player.y = mapDef.spawns.player.y;
    } else {
      if (toX != null) s.player.x = toX;
      if (toY != null) s.player.y = toY;
      this._log(`<span class="c-player">─ Level ${levelId} ─</span>`, 'system');
    }

    this.saveGame();
  }

  // ── Command parser ────────────────────────────────────────────────────────

  processCommand(raw) {
    const s   = this.state;
    const cmd = raw.trim().toLowerCase();

    if (s.phase === 'dead') return;

    if (s.pendingLevelUp.length && !cmd.startsWith('pick') && !cmd.startsWith('choose')) {
      return this._log('A stat boost awaits. Type <span class="c-cmd">pick 1</span>, <span class="c-cmd">2</span>, or <span class="c-cmd">3</span>.', 'warn');
    }

    const parts = cmd.split(/\s+/);
    const verb  = parts[0];
    const args  = parts.slice(1);

    const DIRS = {
      n:  [0,-1], s: [0,1], e: [1,0], w: [-1,0],
      ne: [1,-1], nw:[-1,-1], se:[1,1], sw:[-1,1],
    };

    if (DIRS[verb]) return this._cmdMove(DIRS[verb], parseInt(args[0]) || 1);

    switch (verb) {
      case 'move': case 'm': {
        const d = DIRS[args[0]];
        if (!d) return this._log(`Unknown direction "${args[0]}".`, 'warn');
        return this._cmdMove(d, parseInt(args[1]) || 1);
      }
      case 'interact': case 'x': return this._cmdInteract();
      case 'look':  case 'l':       return this._cmdLook();
      case 'stats':                 return this._cmdStats();
      case 'abilities': case 'ab':  return this._cmdAbilities();
      case 'items': case 'i':       return this._cmdItems();
      case 'pick': case 'choose':   return this._cmdPickUpgrade(parseInt(args[0]) - 1);
      case 'help': case 'h': case '?': return this._cmdHelp();
      default:
        this._log(`Unknown command "<span class="c-cmd">${verb}</span>". Type <span class="c-cmd">help</span>.`, 'warn');
    }
  }

  // ── Movement ──────────────────────────────────────────────────────────────

  _cmdMove(dir, steps = 1) {
    const s = this.state, p = s.player;
    if (s.phase !== 'player') return;

    let moved = 0;
    for (let i = 0; i < steps; i++) {
      const nx = p.x + dir[0], ny = p.y + dir[1];

      const enemy = this._entityAt(nx, ny);
      if (enemy) {
        this.battle.start(enemy);
        return;
      }

      if (!s.map.isPassable(nx, ny)) {
        if (i === 0) this._log('Blocked.', 'system');
        break;
      }

      s.trail.unshift({ x: p.x, y: p.y });
      if (s.trail.length > 6) s.trail.pop();

      p.x = nx;
      p.y = ny;
      moved++;

      this._checkPickup();
      this._checkTrigger();
      this._checkExit();
      if (s.phase !== 'player') return;
    }

    if (moved) s.turn++;

    this.renderer.render(s);
  }

  // ── Enter / interact ──────────────────────────────────────────────────────

  _cmdInteract() {
    const s = this.state, p = s.player;
    if (s.phase !== 'player') return;

    // Standing on exit → take it
    const exitKey = `${p.x},${p.y}`;
    if (s.exits.get(exitKey)) {
      this._checkExit();
      this.renderer.render(s);
      return;
    }

    // Adjacent enemy → battle
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const enemy = this._entityAt(p.x + dx, p.y + dy);
      if (enemy) {
        this.battle.start(enemy);
        return;
      }
    }

    // Adjacent trigger → read message
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const trg = s.triggers.get(`${p.x+dx},${p.y+dy}`);
      if (trg) {
        this._log(`<span class="c-muted">${trg.message}</span>`, 'system');
        return;
      }
    }

    this._cmdLook();
  }

  // ── World event checks ────────────────────────────────────────────────────

  _checkPickup() {
    const s = this.state, p = s.player;
    const idx = s.floorItems.findIndex(it => it.x === p.x && it.y === p.y);
    if (idx === -1) return;

    const fi   = s.floorItems.splice(idx, 1)[0];
    const def  = ITEMS[fi.id];
    if (!def) return;

    p.inventory.push({ ...def });
    this._log(
      `<span class="c-soul-legendary">✦ ${def.name}</span> — ${def.description}`,
      'soul'
    );
    this.saveGame();
  }

  _checkTrigger() {
    const s   = this.state, p = s.player;
    const key = `${p.x},${p.y}`;
    const trg = s.triggers.get(key);
    if (!trg) return;

    this._log(`<span class="c-muted">${trg.message}</span>`, 'system');

    if (trg.itemId) {
      const def = ITEMS[trg.itemId];
      if (def) {
        p.inventory.push({ ...def });
        this._log(`<span class="c-soul-legendary">✦ Found: ${def.name}.</span>`, 'soul');
      }
    }

    if (trg.once) s.triggers.delete(key);
  }

  _checkExit() {
    const s   = this.state, p = s.player;
    const key = `${p.x},${p.y}`;
    const ex  = s.exits.get(key);
    if (!ex) return;

    this._loadLevel(ex.toLevel, ex.toX, ex.toY);
  }

  // ── Soul offering ─────────────────────────────────────────────────────────

  _offerLevelUp() {
    const s = this.state;
    const p = s.player;
    p.level++;

    const lv   = p.level;
    const opts = [
      { stat: 'maxHp',   label: 'Max HP',  amount: 15 + lv * 5 },
      { stat: 'agony',   label: 'Agony',   amount:  8 + lv * 3 },
      { stat: 'essence', label: 'Essence', amount: 10 + lv * 4 },
    ].sort(() => Math.random() - 0.5);

    s.pendingLevelUp = opts;

    this._log('─'.repeat(42), 'divider');
    this._log(`<span class="c-buff">★  LEVEL UP — Lv ${lv}  ★</span>  Choose a stat boost:`, 'soul');
    opts.forEach((opt, i) => {
      this._log(
        `  <span class="c-cmd">${i + 1}.</span>  ` +
        `<span class="c-buff">+${opt.amount} ${opt.label}</span>` +
        `  <span class="c-muted">(${p[opt.stat]} → ${p[opt.stat] + opt.amount})</span>`,
        'soul'
      );
    });
    this._log('Type <span class="c-cmd">pick 1</span>, <span class="c-cmd">2</span>, or <span class="c-cmd">3</span>.', 'soul');
  }

  _cmdPickUpgrade(idx) {
    const s = this.state;
    const p = s.player;
    if (!s.pendingLevelUp.length) return this._log('No level-up pending.', 'warn');
    const opt = s.pendingLevelUp[idx];
    if (!opt) return this._log('Enter 1, 2, or 3.', 'warn');

    p[opt.stat] += opt.amount;
    s.pendingLevelUp = [];

    this._log(
      `<span class="c-buff">+${opt.amount} ${opt.label}</span>  ` +
      `<span class="c-muted">${opt.stat} is now ${p[opt.stat]}</span>`,
      'buff'
    );

    if (opt.stat === 'maxHp') {
      const heal = Math.floor(opt.amount * 0.5);
      p.hp = Math.min(p.hp + heal, p.maxHp);
      this._log(`<span class="c-hp">♥ Restored ${heal} HP.</span>`, 'heal');
    }

    this.saveGame();
    this.renderer.render(s);
  }

  // ── Info commands ─────────────────────────────────────────────────────────

  _cmdLook() {
    const s = this.state, p = s.player;
    const near = s.entities.filter(e => e.hp > 0 && this._dist(p, e) <= 14);
    if (!near.length) { this._log('No threats visible.', 'system'); return; }
    this._log('Nearby:', 'system');
    for (const e of near) {
      const cls = e.isBoss ? 'c-boss' : 'c-enemy';
      this._log(
        `  <span class="${cls}">${e.name}</span> — HP ${e.hp}/${e.maxHp} — dist ${this._dist(p, e)}`,
        'system'
      );
    }
  }

  _cmdStats() {
    const p = this.state.player;
    this._log('═══ CHARACTER ═══', 'system');
    this._log(`<span class="c-player">${p.name}</span> the <span class="c-class">${p.class}</span>  ·  Lv <span class="c-buff">${p.level}</span>`, 'system');
    this._log(`HP <span class="c-hp">${p.hp}/${p.maxHp}</span>  MP <span class="c-mp">${p.mp}/${p.maxMp}</span>  XP <span class="c-essence">${p.xp}/${p.maxXp}</span>`, 'system');
    this._log(`Agony <span class="c-agony">${p.agony}</span>  Essence <span class="c-essence">${p.essence}</span>`, 'system');
  }

  _cmdAbilities() {
    const p = this.state.player;
    this._log('═══ ABILITIES ═══', 'system');
    p.abilities.forEach((key) => {
      const ab = ABILITIES[key];
      if (!ab) return;
      const mp = ab.mpCost > 0 ? `<span class="c-mp">${ab.mpCost}mp</span>` : 'free';
      this._log(`  <span class="c-cmd">${key}</span> [${mp}] — ${ab.description}`, 'ability');
    });
  }

  _cmdItems() {
    const p = this.state.player;
    if (!p.inventory.length) { this._log('Inventory empty.', 'system'); return; }
    this._log('═══ INVENTORY ═══', 'system');
    p.inventory.forEach((item, i) => {
      this._log(`  <span class="c-cmd">${i + 1}.</span> <span class="c-buff">${item.name}</span> — ${item.description}`, 'system');
    });
    this._log('Use <span class="c-cmd">give &lt;name&gt;</span> during battle to offer an item.', 'system');
  }

  _cmdHelp() {
    this._log('═══ COMMANDS ═══', 'system');
    this._log('<span class="c-cmd">arrows / n s e w</span> [steps] — Move', 'system');
    this._log('<span class="c-cmd">Enter</span> (empty) — interact with adjacent things', 'system');
    this._log('<span class="c-cmd">look  stats  abilities  items</span>', 'system');
    this._log('<span class="c-cmd">pick 1/2/3</span> — Choose stat boost on level-up', 'system');
    this._log('Walk into an enemy to start a battle.', 'system');
    this._log('─── IN BATTLE ───', 'system');
    this._log('<span class="c-cmd">&lt;ability name&gt;</span> — use ability  <span class="c-cmd">flee</span> — escape  <span class="c-cmd">give &lt;item&gt;</span> — offer', 'system');
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  _dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  _entityAt(x, y) {
    return this.state.entities.find(e => {
      if (e.hp <= 0) return false;
      if (e.sprite.width > 1 || e.sprite.height > 1) {
        return x >= e.x && x < e.x + e.sprite.width &&
               y >= e.y && y < e.y + e.sprite.height;
      }
      return e.x === x && e.y === y;
    }) ?? null;
  }

  _log(html, type = 'normal') { this.renderer.addLog(html, type); }
  _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  const renderer = new Renderer(
    document.getElementById('map'),
    document.getElementById('hud'),
    document.getElementById('log'),
    document.getElementById('ability-hint'),
  );
  const game    = new GameEngine(renderer);
  const inputEl = document.getElementById('terminal-input');
  const logEl   = document.getElementById('log');

  const save = GameEngine.loadSave();
  if (save) {
    showContinueScreen(game, renderer, inputEl, logEl, save);
  } else {
    showClassSelect(game, renderer, inputEl, logEl);
  }
});

// ── Continue screen ───────────────────────────────────────────────────────────

function showContinueScreen(game, renderer, inputEl, logEl, save) {
  logEl.innerHTML = '';
  const add = (html, type = 'system') => {
    const d = document.createElement('div');
    d.className = `log-${type}`;
    d.innerHTML = html;
    logEl.appendChild(d);
  };

  const sp = save.player;
  add('╔══════════════════════════════════════════╗');
  add('║           L  E  V  I  A  T  H  A  N      ║', 'boss');
  add('╚══════════════════════════════════════════╝');
  add('');
  add(`Save found: <span class="c-player">${sp.name}</span> the <span class="c-class">${sp.class}</span>  Lv <span class="c-buff">${sp.level}</span>  HP <span class="c-hp">${sp.hp}/${sp.maxHp}</span>`, 'soul');
  add('');
  add('<span class="c-cmd">c</span> — Continue  &nbsp; <span class="c-cmd">n</span> — New Game', 'system');

  function handler(e) {
    if (e.key !== 'Enter') return;
    const val = inputEl.value.trim().toLowerCase();
    inputEl.value = '';
    if (val === 'c' || val === 'continue') {
      inputEl.removeEventListener('keydown', handler);
      game.init(sp.class, sp.name);
      game._applySave(save);
      renderer.clearLog();
      renderer.startAnimation(() => game.getState());
      renderer.render(game.getState());
      renderer.updateAbilityHints(game.getState().player, ABILITIES);
      game._log(`<span class="c-player">${sp.name}</span> returns to the dark.`, 'system');
      attachGameInput(game, renderer, inputEl);
    } else if (val === 'n' || val === 'new') {
      GameEngine.clearSave();
      inputEl.removeEventListener('keydown', handler);
      showClassSelect(game, renderer, inputEl, logEl);
    } else {
      add('Type <span class="c-cmd">c</span> to continue or <span class="c-cmd">n</span> for new game.', 'warn');
    }
  }
  inputEl.addEventListener('keydown', handler);
  inputEl.focus();
}

// ── Class selection screen ────────────────────────────────────────────────────

function showClassSelect(game, renderer, inputEl, logEl) {
  logEl.innerHTML = '';
  const add = (html, type = 'system') => {
    const d = document.createElement('div');
    d.className = `log-${type}`;
    d.innerHTML = html;
    logEl.appendChild(d);
  };

  add('╔══════════════════════════════════════════╗');
  add('║           L  E  V  I  A  T  H  A  N      ║', 'boss');
  add('╠══════════════════════════════════════════╣');
  add('║           Out of the Abyss               ║');
  add('╚══════════════════════════════════════════╝');
  add('');
  add('Choose your class:', 'soul');

  const entries = Object.entries(CLASSES);
  entries.forEach(([name, def], i) => {
    add(`  <span class="c-cmd">${i + 1}. ${name}</span> — ${def.description}`, 'ability');
    const st = def.baseStats;
    add(`<span class="c-hp"> HP ${st.maxHp} </span> | <span class="c-agony"> AGO ${st.agony} </span> | <span class="c-essence"> ESS ${st.essence} </span>`, 'system');
  });
  add('NOTE: Your total mana is = to half your Essence stat.', 'system');
  add('Type <span class="c-cmd">1</span>, <span class="c-cmd">2</span>, or <span class="c-cmd">3</span>.', 'system');

  function handler(e) {
    if (e.key !== 'Enter') return;
    const val = inputEl.value.trim();
    inputEl.value = '';
    const idx = parseInt(val) - 1;
    if (!entries[idx]) { add('Enter 1, 2, or 3.', 'warn'); return; }
    inputEl.removeEventListener('keydown', handler);
    const chosenClass = entries[idx][0];
    startGame(game, renderer, inputEl, chosenClass, chosenClass);
  }
  inputEl.addEventListener('keydown', handler);
  inputEl.focus();
}

// ── Start game ────────────────────────────────────────────────────────────────

function startGame(game, renderer, inputEl, className, playerName) {
  game.init(className, playerName);
  renderer.clearLog();
  renderer.startAnimation(() => game.getState());
  renderer.render(game.getState());
  renderer.updateAbilityHints(game.getState().player, ABILITIES);

  game._log('╔══════════════════════════════════════════╗');
  game._log(`║  ${playerName} enters the dark.`.padEnd(44) + '║');
  game._log('╚══════════════════════════════════════════╝');
  game._log('Walk into enemies to battle. Press <span class="c-cmd">Enter</span> (empty) to interact. Type <span class="c-cmd">help</span>.', 'system');

  attachGameInput(game, renderer, inputEl);
}

// ── Shared input handler (used by startGame and continue) ─────────────────────

function attachGameInput(game, renderer, inputEl) {
  const ARROW_DIR = { ArrowUp:'n', ArrowDown:'s', ArrowLeft:'w', ArrowRight:'e' };

  function onKeyDown(e) {
    const phase = game.getState()?.phase;

    if (phase === 'dead' && e.key === 'Enter') {
      e.preventDefault();
      GameEngine.clearSave();
      document.removeEventListener('keydown', onKeyDown);
      inputEl.removeEventListener('keydown', onInput);
      renderer.clearLog();
      showClassSelect(game, renderer, inputEl, document.getElementById('log'));
      return;
    }

    const dir = ARROW_DIR[e.key];
    if (!dir) return;
    e.preventDefault();
    if (phase === 'battle') {
      game.battle.moveSoul(dir);
    } else if (phase === 'player') {
      game.processCommand(dir);
    }
  }

  function onInput(e) {
    if (e.key !== 'Enter') return;
    const raw = inputEl.value.trim();
    inputEl.value = '';

    const phase = game.getState()?.phase;

    if (phase === 'dead') {
      GameEngine.clearSave();
      document.removeEventListener('keydown', onKeyDown);
      inputEl.removeEventListener('keydown', onInput);
      renderer.clearLog();
      showClassSelect(game, renderer, inputEl, document.getElementById('log'));
      return;
    }

    if (phase === 'battle') {
      if (!raw) return;
      const parts = raw.toLowerCase().split(/\s+/);
      const verb  = parts[0];

      if (verb === 'give')                    { game.battle.giveItem(parts.slice(1).join(' ')); return; }
      if (verb === 'items' || verb === 'i')   { game.battle.showItems(); return; }
      if (verb === 'flee')                    { game.battle.flee(); return; }

      const p    = game.getState().player;
      const slot = p.abilities.indexOf(verb);
      if (slot !== -1) { game.battle.attack(slot); return; }

      if (ABILITY_ALIASES.has(verb)) {
        game._log(`<span class="c-muted">You don't have ${verb} equipped.</span>`, 'warn');
        return;
      }

      const names = p.abilities.join(' · ');
      game._log(`<span class="c-muted">Unknown command. Your abilities: ${names}</span>`, 'system');
      return;
    }

    // Overworld — empty Enter = interact
    if (!raw) {
      game.processCommand('interact');
      return;
    }

    game._log(`<span class="c-prompt">></span> ${raw}`, 'input');
    game.processCommand(raw);
  }

  document.addEventListener('keydown', onKeyDown);
  inputEl.addEventListener('keydown', onInput);
  inputEl.focus();
}
