// game.js — Main game state, turn logic, and command parser for LEVIATHAN
// Entry point: loaded as type="module" from index.html

import { Renderer }               from './renderer.js';
import { LEVELS }                  from './map.js';
import { createPlayer, CLASSES }   from './classes.js';
import { ABILITIES, ABILITY_ALIASES } from './abilities.js';
import { spawnEnemy }              from './enemies.js';
import { getRandomSouls, applySoul } from './souls.js';

// ── Game class ──────────────────────────────────────────────────────────────

class Game {
  constructor(renderer) {
    this.renderer = renderer;
    this.state    = null;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  init(className, playerName) {
    const map    = LEVELS[1]();
    const player = createPlayer(className, playerName);
    player.x     = map.spawns.player.x;
    player.y     = map.spawns.player.y;

    let eid = 0;
    const entities = [
      ...map.spawns.enemies.map(s => spawnEnemy(s.type, s.x, s.y, `e${eid++}`)),
      ...map.spawns.bosses.map(s  => spawnEnemy(s.type, s.x, s.y, `b${eid++}`)),
    ];

    this.state = {
      map,
      player,
      entities,
      turn:         1,
      movLeft:      player.speed,
      actLeft:      1,
      phase:        'player',   // 'player' | 'enemy' | 'dead'
      target:       null,
      pendingSouls: [],
      trail:       [],
      preview:     { path: [], cursor: null, movesUsed: 0 },
      activeEnemy: null, // id of enemy currently taking their turn
    };
  }

  getState() { return this.state; }

  // ── Command parser ────────────────────────────────────────────────────────

  processCommand(raw) {
    const s = this.state;

    if (s.phase === 'dead') {
      return this._log('You are dead. Refresh to start again.', 'warn');
    }
    if (s.phase !== 'player') {
      return this._log('Not your turn.', 'warn');
    }

    // If a soul offering is pending, only allow pick commands
    if (s.pendingSouls.length && !raw.trim().startsWith('pick') && !raw.trim().startsWith('choose')) {
      return this._log('A soul awaits. Type <span class="c-cmd">pick 1/2/3</span> to choose.', 'warn');
    }

    const parts = raw.trim().toLowerCase().split(/\s+/);
    const cmd   = parts[0];
    const args  = parts.slice(1);

    // While movement is previewed, block non-movement commands (except confirm/cancel)
    if (s.preview.path.length > 0) {
      const MOVE_CMDS = new Set(['n','s','e','w','ne','nw','se','sw','move','m','confirm','go','commit','cancel','back','wait','pass','z']);
      if (!MOVE_CMDS.has(cmd)) {
        return this._log(
          `Move preview active (${s.preview.path.length} steps). ` +
          `<span class="c-cmd">confirm</span> · <span class="c-cmd">cancel</span>`,
          'warn'
        );
      }
    }

    const DIRS = {
      n: [0,-1], s: [0,1], e: [1,0], w: [-1,0],
      ne: [1,-1], nw: [-1,-1], se: [1,1], sw: [-1,1],
    };

    if (DIRS[cmd]) return this._cmdMove(DIRS[cmd], parseInt(args[0]) || 1);

    if (ABILITY_ALIASES.has(cmd)) return this._cmdCast(cmd, args);

    switch (cmd) {
      case 'move': case 'm': {
        const d = DIRS[args[0]];
        if (!d) return this._log(`Unknown direction "${args[0]}". Use n/s/e/w/ne/nw/se/sw.`, 'warn');
        return this._cmdMove(d, parseInt(args[1]) || 1);
      }
      case 'cast': case 'c': case 'use':
        return this._cmdCast(args[0], args.slice(1));
      case 'wait': case 'pass': case 'z':
        if (s.preview.path.length > 0) this._cmdCancel();
        return this._endPlayerTurn();
      case 'confirm': case 'go': case 'commit':
        return this._cmdConfirm();
      case 'cancel': case 'back':
        return this._cmdCancel();
      case 'target': case 't':
        return this._cmdTarget(args[0]);
      case 'look': case 'l':
        return this._cmdLook();
      case 'stats':
        return this._cmdStats();
      case 'souls':
        return this._cmdSouls();
      case 'abilities': case 'ab': case 'skills':
        return this._cmdAbilities();
      case 'pick': case 'choose':
        return this._cmdPickSoul(parseInt(args[0]) - 1);
      case 'help': case 'h': case '?':
        return this._cmdHelp();
      default:
        this._log(`Unknown command "<span class="c-cmd">${cmd}</span>". Type <span class="c-cmd">help</span>.`, 'warn');
    }
  }

  // ── Movement (preview mode) ───────────────────────────────────────────────
  // Directions build a ghost path. `confirm` / Enter commits it.

  _cmdMove(dir, steps) {
    const s = this.state;

    if (s.movLeft - s.preview.movesUsed <= 0) {
      return this._log('No movement left. <span class="c-cmd">wait</span> to end your turn.', 'warn');
    }

    let cx = s.preview.cursor?.x ?? s.player.x;
    let cy = s.preview.cursor?.y ?? s.player.y;
    let added = 0;

    for (let i = 0; i < steps; i++) {
      if (s.preview.movesUsed >= s.movLeft) break;
      const nx = cx + dir[0], ny = cy + dir[1];
      if (!s.map.isPassable(nx, ny)) { this._log('Blocked.', 'system'); break; }
      if (this._entityAt(nx, ny))    { this._log('Something is in the way.', 'system'); break; }

      s.preview.path.push({ x: nx, y: ny });
      s.preview.cursor = { x: nx, y: ny };
      s.preview.movesUsed++;
      cx = nx; cy = ny;
      added++;
    }

    if (added > 0) {
      const rem = s.movLeft - s.preview.movesUsed;
      this._log(
        `${s.preview.movesUsed} step${s.preview.movesUsed !== 1 ? 's' : ''} planned` +
        (rem > 0 ? `, ${rem} remaining` : '') +
        `. <span class="c-cmd">confirm</span> or ↵ · <span class="c-cmd">cancel</span>`,
        'system'
      );
    }

    this.renderer.render(s);
  }

  _cmdConfirm() {
    const s = this.state, p = s.player;
    if (!s.preview.path.length) {
      return this._log('No movement queued — use arrow keys or n/s/e/w first.', 'system');
    }
    const steps = s.preview.movesUsed;
    for (const pos of s.preview.path) {
      s.trail.unshift({ x: p.x, y: p.y });
      if (s.trail.length > 5) s.trail.pop();
      p.x = pos.x;
      p.y = pos.y;
    }
    s.movLeft -= steps;
    s.preview  = { path: [], cursor: null, movesUsed: 0 };

    this._log(`You move ${steps} step${steps !== 1 ? 's' : ''}.`, 'move');
    this._autoTarget();

    if (s.movLeft <= 0 && s.actLeft > 0) {
      this._log('Moves spent. Use an ability or <span class="c-cmd">wait</span>.', 'system');
    }

    if (s.movLeft <= 0 && s.actLeft <= 0) this._endPlayerTurn();
    else this.renderer.render(s);
  }

  _cmdCancel() {
    const s = this.state;
    if (!s.preview.path.length) return;
    s.preview = { path: [], cursor: null, movesUsed: 0 };
    this._log('Movement cancelled.', 'system');
    this.renderer.render(s);
  }

  // ── Ability use ──────────────────────────────────────────────────────────

  _cmdCast(key, args = []) {
    const s = this.state, p = s.player;

    if (!key) return this._log('Usage: cast <ability>', 'warn');
    const normKey = key.replace(/-/g, '_');

    if (!p.abilities.includes(normKey)) {
      return this._log(`You don't know "${normKey}". Type <span class="c-cmd">abilities</span>.`, 'warn');
    }

    const ab = ABILITIES[normKey];
    if (!ab) return this._log('Ability data missing.', 'warn');

    if (s.actLeft <= 0) {
      return this._log('No actions left this turn. <span class="c-cmd">wait</span> to end turn.', 'warn');
    }

    const mpCost = p._hollowSoul ? 0 : ab.mpCost;
    if (p.mp < mpCost) {
      return this._log(`Not enough MP (need ${mpCost}, have ${p.mp}).`, 'warn');
    }

    // Resolve target
    let target = s.target && s.target.hp > 0 ? s.target : null;
    if (!target && ab.type !== 'buff' && ab.type !== 'teleport') {
      target = this._nearestEnemy();
      if (target) {
        s.target = target;
        this._log(`Auto-targeting <span class="c-enemy">${target.name}</span>.`, 'system');
      } else {
        return this._log('No enemies in sight.', 'warn');
      }
    }

    // Range check
    if (target && ab.range > 0) {
      const dist = this._dist(p, target);
      if (dist > ab.range) {
        return this._log(
          `${ab.name} out of range (range: ${ab.range}, distance: ${dist}).`, 'warn');
      }
    }

    p.mp       -= mpCost;
    s.actLeft  -= 1;
    this._resolveAbility(ab, p, target, args);

    if (s.movLeft <= 0 && s.actLeft <= 0) this._endPlayerTurn();
    else this.renderer.render(s);
  }

  // ── Ability resolution ────────────────────────────────────────────────────

  _resolveAbility(ab, user, target, args) {
    const s = this.state;

    if (ab.type === 'buff') {
      if (ab.effect) {
        const e = ab.effect;
        user[e.stat] += e.amount;
        user.statusEffects.push({ type: e.stat + '_buff', stat: e.stat, amount: e.amount, remaining: e.duration });
        this._log(`<span class="c-buff">⬆ ${ab.name}:</span> ${ab.description}`, 'buff');
      }
      return;
    }

    if (ab.type === 'teleport') {
      const tx = parseInt(args[0]), ty = parseInt(args[1]);
      if (isNaN(tx) || isNaN(ty)) {
        return this._log('Usage: blink &lt;x&gt; &lt;y&gt;  (check position by looking at the map)', 'warn');
      }
      if (!s.map.isPassable(tx, ty)) {
        return this._log('Cannot blink there — not a floor tile.', 'warn');
      }
      if (this._dist(user, { x: tx, y: ty }) > ab.range) {
        return this._log(`Out of blink range (max ${ab.range}).`, 'warn');
      }
      user.x = tx; user.y = ty;
      this._log(`<span class="c-essence">≈ You blink to (${tx},${ty}).</span>`, 'ability');
      return;
    }

    // Damage ability ─────────────────────────────────────────────────────

    // Berserker: bonus agony based on missing HP
    let effectiveStats = user;
    if (user._berserker) {
      const bonus = Math.floor((user.maxHp - user.hp) / 10);
      effectiveStats = { ...user, agony: user.agony + bonus };
    }

    const hollowMult = user._hollowSoul ? 0.8 : 1.0;

    let targets;
    if (ab.type === 'aoe') {
      const cx = parseInt(args[0]), cy = parseInt(args[1]);
      if (!isNaN(cx) && !isNaN(cy)) {
        this._log(`<span class="c-essence">AOE at (${cx},${cy}) r${ab.range}</span>`, 'ability');
        targets = this._targetsInRadius({ x: cx, y: cy }, ab.range);
      } else {
        targets = this._meleeTargets(user, ab.range);
      }
    } else {
      targets = [target];
    }

    for (const t of targets) {
      if (!t || t.hp <= 0) continue;

      let dmg = Math.floor(ab.damage(effectiveStats) * hollowMult);

      if (user._voidSoul) {
        dmg = t.isBoss ? Math.floor(dmg * 1.6) : Math.floor(dmg * 0.75);
      }

      const doHit = (mult = 1) => {
        const d = Math.max(1, Math.floor(dmg * mult));
        t.hp -= d;

        const hitCls = d >= 20 ? 'c-crit' : 'c-hit';
        this._log(
          `<span class="${ab.projColor}">${this._esc(ab.projChar ?? '·')}</span> ` +
          `<span class="c-cmd">${ab.name}</span> hits ` +
          `<span class="${t.isBoss ? 'c-boss' : 'c-enemy'}">${t.name}</span> ` +
          `for <span class="${hitCls}">${d}</span>.`,
          'ability'
        );

        const drainRate = (ab.drain ?? 0) + user._vampireDrain;
        if (drainRate > 0) {
          const heal = Math.max(1, Math.floor(d * drainRate));
          user.hp = Math.min(user.maxHp, user.hp + heal);
          this._log(`<span class="c-heal">♥ Drain: +${heal} HP.</span>`, 'heal');
        }

        if (ab.bleed) {
          t.statusEffects.push({
            type: 'bleed',
            damage: Math.max(1, Math.floor(d * 0.2)),
            remaining: ab.bleed,
          });
          this._log(`<span class="c-agony">✦ ${t.name} starts bleeding.</span>`, 'status');
        }

        if (t.hp <= 0) this._kill(t, user);
      };

      doHit(1.0);
      if (user._echoShot && ab.type === 'projectile' && target?.hp > 0) {
        doHit(0.5);
        this._log(`<span class="c-essence">↩ Echo!</span>`, 'echo');
      }
    }
  }

  // ── Kill ──────────────────────────────────────────────────────────────────

  _kill(entity, killer) {
    const s = this.state;
    entity.hp = 0;
    this._log(`<span class="c-kill">✦ ${entity.name} has fallen.</span>`, 'kill');

    if (killer === s.player) {
      s.player.xp += entity.xpReward;

      if (s.player._lichKill) {
        s.player.mp = Math.min(s.player.maxMp, s.player.mp + 8);
        this._log(`<span class="c-essence">☽ Lich Soul: +8 MP.</span>`, 'soul');
      }

      if (entity.isBoss) this._offerSouls();
    }

    const idx = s.entities.indexOf(entity);
    if (idx !== -1) s.entities.splice(idx, 1);
    if (s.target === entity) s.target = null;
  }

  // ── Soul offering ─────────────────────────────────────────────────────────

  _offerSouls() {
    const s    = this.state;
    const excl = s.player.souls.map(so => so.id);
    s.pendingSouls = getRandomSouls(3, excl);

    this._log('─'.repeat(42), 'divider');
    this._log(`<span class="c-boss">★ SOUL OFFERING ★</span> Choose your augment:`, 'soul');
    s.pendingSouls.forEach((soul, i) => {
      const rc = `c-soul-${soul.rarity}`;
      this._log(
        `  <span class="c-cmd">${i + 1}.</span> ` +
        `<span class="${rc}">[${soul.rarity.toUpperCase()}] ${soul.name}</span>` +
        ` — ${soul.description}`,
        'soul'
      );
    });
    this._log('Type <span class="c-cmd">pick 1</span>, <span class="c-cmd">pick 2</span>, or <span class="c-cmd">pick 3</span>.', 'soul');
  }

  _cmdPickSoul(idx) {
    const s = this.state;
    if (!s.pendingSouls.length) return this._log('No soul offering is active.', 'warn');
    const soul = s.pendingSouls[idx];
    if (!soul) return this._log('Enter 1, 2, or 3.', 'warn');

    const applied = applySoul(s.player, soul.id);
    s.pendingSouls = [];
    this._log(`<span class="c-soul-${applied.rarity}">★ You absorb the ${applied.name}.</span>`, 'soul');
    this._log(`<span class="c-essence">${applied.description}</span>`, 'soul');
    this.renderer.render(s);
  }

  // ── Enemy turn (async — input blocked by phase='enemy') ─────────────────

  _endPlayerTurn() {
    const s = this.state;
    s.phase = 'enemy';
    this._runEnemyTurns(); // fire-and-forget
  }

  async _runEnemyTurns() {
    const s = this.state;

    // Enemies act fastest-first, then by spawn order
    const order = s.entities
      .filter(e => e.hp > 0)
      .sort((a, b) => b.speed - a.speed);

    for (const enemy of order) {
      if (s.player.hp <= 0) break;
      s.activeEnemy = enemy.id;
      this.renderer.render(s);      // show active-enemy highlight
      await this._wait(420);
      this._runEnemyAI(enemy);
      s.activeEnemy = null;
      this.renderer.render(s);
      await this._wait(160);
    }

    s.activeEnemy = null;
    this._tickStatus();

    if (s.player.hp <= 0) {
      this._log('<span class="c-boss">✦ YOU HAVE FALLEN. Refresh to start again. ✦</span>', 'kill');
      s.phase = 'dead';
      this.renderer.render(s);
      return;
    }

    s.turn++;
    s.movLeft = s.player.speed;
    s.actLeft = 1;
    s.phase   = 'player';
    s.preview = { path: [], cursor: null, movesUsed: 0 };

    this._log(`── Turn ${s.turn} ──`, 'turn');
    this.renderer.render(s);
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  _runEnemyAI(enemy) {
    const s = this.state, p = s.player;
    const dist = this._dist(enemy, p);
    if (dist > enemy.sight) return;

    // Phase transition
    const phase = enemy.phases[enemy.currentPhase];
    if (phase && enemy.hp / enemy.maxHp <= phase.hpThreshold && !enemy.enraged) {
      enemy.speed   += phase.speedBoost;
      enemy.enraged  = true;
      enemy.currentPhase++;
      this._log(`<span class="c-boss">⚠ ${enemy.name} ENRAGES!</span>`, 'boss');
    }

    switch (enemy.behavior) {
      case 'walker':
      case 'charger':
        this._enemyWalkToward(enemy, p.x, p.y, enemy.speed);
        if (this._dist(enemy, p) <= enemy.attackRange) this._enemyMelee(enemy, p);
        break;

      case 'shooter':
        if (dist < 3) {
          this._enemyWalkAway(enemy, p.x, p.y);
        } else if (dist <= enemy.attackRange) {
          this._enemyShoot(enemy, p);
        } else {
          this._enemyWalkToward(enemy, p.x, p.y, 1);
        }
        break;

      case 'boss_warden':
        if (s.turn % 3 === 0) {
          this._enemyShoot(enemy, p);
        } else {
          this._enemyWalkToward(enemy, p.x, p.y, enemy.speed);
          if (dist <= enemy.attackRange) this._enemyMelee(enemy, p);
        }
        break;
    }
  }

  _enemyWalkToward(enemy, tx, ty, steps) {
    const s = this.state;
    for (let i = 0; i < steps; i++) {
      const dx = Math.sign(tx - enemy.x), dy = Math.sign(ty - enemy.y);
      const dirs = [[dx, dy], [dx, 0], [0, dy]].filter(d => d[0] || d[1]);
      let moved = false;
      for (const [ddx, ddy] of dirs) {
        const nx = enemy.x + ddx, ny = enemy.y + ddy;
        if (s.map.isPassable(nx, ny) &&
            !this._entityAt(nx, ny, enemy) &&
            !(nx === s.player.x && ny === s.player.y)) {
          enemy.x = nx; enemy.y = ny;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
  }

  _enemyWalkAway(enemy, tx, ty) {
    const s   = this.state;
    const dx  = -Math.sign(tx - enemy.x), dy = -Math.sign(ty - enemy.y);
    const nx  = enemy.x + dx, ny = enemy.y + dy;
    if (s.map.isPassable(nx, ny) && !this._entityAt(nx, ny, enemy)) {
      enemy.x = nx; enemy.y = ny;
    }
  }

  _enemyMelee(enemy, target) {
    const base = enemy.enraged ? enemy.phases[enemy.currentPhase - 1]?.damageBoost ?? 1 : 1;
    const dmg  = Math.max(1, Math.floor(enemy.attackDamage(enemy) * base));
    target.hp -= dmg;
    const cls = dmg >= 20 ? 'c-crit' : 'c-hit';
    this._log(
      `<span class="c-enemy">${enemy.name}</span> strikes you for <span class="${cls}">${dmg}</span>!`,
      'enemy'
    );
  }

  _enemyShoot(enemy, target) {
    const base = enemy.enraged ? enemy.phases[enemy.currentPhase - 1]?.damageBoost ?? 1 : 1;
    const dmg  = Math.max(1, Math.floor(enemy.attackDamage(enemy) * base));
    target.hp -= dmg;
    this._log(
      `<span class="c-enemy">${enemy.name}</span> fires ` +
      `<span class="c-essence">${this._esc(enemy.projChar)}</span> ` +
      `at you for <span class="c-hit">${dmg}</span>!`,
      'enemy'
    );
  }

  // ── Status tick ───────────────────────────────────────────────────────────

  _tickStatus() {
    const s = this.state;

    s.player.statusEffects = s.player.statusEffects.filter(eff => {
      if (eff.type === 'bleed') {
        s.player.hp -= eff.damage;
        this._log(`<span class="c-agony">You bleed for ${eff.damage}.</span>`, 'status');
      } else if (eff.stat) {
        // buff expiry
      }
      eff.remaining--;
      if (eff.remaining <= 0 && eff.stat) {
        s.player[eff.stat] -= eff.amount;
        this._log(`<span class="c-muted">${eff.stat} buff fades.</span>`, 'system');
      }
      return eff.remaining > 0;
    });

    for (const e of [...s.entities]) {
      if (e.hp <= 0) continue;
      e.statusEffects = e.statusEffects.filter(eff => {
        if (eff.type === 'bleed') {
          e.hp -= eff.damage;
          this._log(`<span class="c-agony">${e.name} bleeds for ${eff.damage}.</span>`, 'status');
          if (e.hp <= 0) this._kill(e, s.player);
        }
        eff.remaining--;
        return eff.remaining > 0;
      });
    }
  }

  // ── Informational commands ────────────────────────────────────────────────

  _cmdTarget(name) {
    if (!name) {
      const t = this._nearestEnemy();
      if (!t) return this._log('No enemies nearby.', 'warn');
      this.state.target = t;
      return this._log(`Targeting <span class="c-enemy">${t.name}</span>.`, 'system');
    }
    const e = this.state.entities.find(
      e => e.hp > 0 && e.name.toLowerCase().includes(name.toLowerCase())
    );
    if (!e) return this._log(`No enemy matching "${name}".`, 'warn');
    this.state.target = e;
    this._log(`Targeting <span class="c-enemy">${e.name}</span>.`, 'system');
  }

  _cmdLook() {
    const s = this.state, p = s.player;
    const visible = s.entities.filter(e => e.hp > 0 && this._dist(p, e) <= 14);
    if (!visible.length) return this._log('The area appears clear.', 'system');
    this._log('Nearby threats:', 'system');
    for (const e of visible) {
      const d    = this._dist(p, e);
      const hpPc = Math.round((e.hp / e.maxHp) * 100);
      const cls  = e.isBoss ? 'c-boss' : 'c-enemy';
      this._log(
        `  <span class="${cls}">${e.name}</span> — HP ${hpPc}% — dist ${d}` +
        (e.enraged ? ' <span class="c-crit">[ENRAGED]</span>' : ''),
        'system'
      );
    }
  }

  _cmdStats() {
    const p = this.state.player;
    this._log('═══ CHARACTER ═══', 'system');
    this._log(`<span class="c-player">${p.name}</span> the <span class="c-class">${p.class}</span> · Level ${p.level} · ${p.xp} XP`, 'system');
    this._log(`HP <span class="c-hp">${p.hp}/${p.maxHp}</span>  MP <span class="c-mp">${p.mp}/${p.maxMp}</span>`, 'system');
    this._log(`Agony <span class="c-agony">${p.agony}</span>  Essence <span class="c-essence">${p.essence}</span>  Speed <span class="c-stat">${p.speed}</span>`, 'system');
    if (p.statusEffects.length) {
      this._log(`Effects: ${p.statusEffects.map(e => e.type).join(', ')}`, 'status');
    }
  }

  _cmdSouls() {
    const p = this.state.player;
    if (!p.souls.length) return this._log('No souls yet. Defeat bosses to earn them.', 'system');
    this._log('═══ SOULS ═══', 'system');
    p.souls.forEach(soul => {
      const cls = `c-soul-${soul.rarity}`;
      this._log(`  <span class="${cls}">★ ${soul.name}</span> — ${soul.description}`, 'soul');
    });
  }

  _cmdAbilities() {
    const p = this.state.player;
    this._log('═══ ABILITIES ═══', 'system');
    p.abilities.forEach(key => {
      const ab = ABILITIES[key];
      if (!ab) return;
      const mpText  = ab.mpCost > 0 ? `<span class="c-mp">${ab.mpCost} MP</span>` : '<span class="c-floor">free</span>';
      const rngText = ab.range > 0  ? `rng ${ab.range}` : 'self';
      const scl     = Object.entries(ab.scaling).map(([k, v]) => `${Math.round(v * 100)}% ${k}`).join('+');
      this._log(
        `  <span class="c-cmd">${key}</span> [${mpText}][${rngText}] — ${ab.description}` +
        (scl ? ` <span class="c-muted">(${scl})</span>` : ''),
        'ability'
      );
    });
  }

  _cmdHelp() {
    this._log('═══ COMMANDS ═══', 'system');
    this._log('<span class="c-cmd">n s e w ne nw se sw</span> [steps] — Move', 'system');
    this._log('<span class="c-cmd">cast &lt;ability&gt;</span>  or just type the ability name', 'system');
    this._log('<span class="c-cmd">target [name]</span> — Set target (auto-targets nearest if blank)', 'system');
    this._log('<span class="c-cmd">wait</span> — End your turn (skip remaining moves/actions)', 'system');
    this._log('<span class="c-cmd">look</span> — Survey nearby threats', 'system');
    this._log('<span class="c-cmd">stats</span>  <span class="c-cmd">souls</span>  <span class="c-cmd">abilities</span> — Character info', 'system');
    this._log('<span class="c-cmd">pick 1/2/3</span> — Choose a soul offering after a boss kill', 'system');
    this._log('Each turn: move up to SPEED tiles + 1 action.', 'system');
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  _dist(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  _entityAt(x, y, exclude = null) {
    return this.state.entities.find(e => {
      if (e === exclude || e.hp <= 0) return false;
      if (e.sprite.width > 1 || e.sprite.height > 1) {
        return x >= e.x && x < e.x + e.sprite.width &&
               y >= e.y && y < e.y + e.sprite.height;
      }
      return e.x === x && e.y === y;
    }) ?? null;
  }

  _meleeTargets(user, range) {
    return this.state.entities.filter(e => e.hp > 0 && this._dist(user, e) <= range);
  }

  _targetsInRadius(center, radius) {
    return this.state.entities.filter(e => e.hp > 0 && this._dist(center, e) <= radius);
  }

  _nearestEnemy() {
    const p = this.state.player;
    let best = null, bestD = Infinity;
    for (const e of this.state.entities) {
      if (e.hp <= 0) continue;
      const d = this._dist(p, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  _autoTarget() {
    const s = this.state;
    if (!s.target || s.target.hp <= 0) {
      const n = this._nearestEnemy();
      if (n && this._dist(s.player, n) <= 12) s.target = n;
    }
  }

  _log(html, type = 'normal') {
    this.renderer.addLog(html, type);
  }

  _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  _dirName(dir) {
    const m = {
      '0,-1':'north','0,1':'south','1,0':'east','-1,0':'west',
      '1,-1':'northeast','-1,-1':'northwest','1,1':'southeast','-1,1':'southwest',
    };
    return m[dir.join(',')] ?? 'somewhere';
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  const mapEl          = document.getElementById('map');
  const hudEl          = document.getElementById('hud');
  const logEl          = document.getElementById('log');
  const inputEl        = document.getElementById('terminal-input');
  const enemyPanelEl   = document.getElementById('enemy-list');
  const abilityHintEl  = document.getElementById('ability-hint');

  const renderer = new Renderer(mapEl, hudEl, logEl, enemyPanelEl, abilityHintEl);
  const game     = new Game(renderer);

  showClassSelect(game, renderer, inputEl, logEl);
});

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
  add('║             Out of the Abyss             ║');
  add('╚══════════════════════════════════════════╝');
  add('');
  add('Choose your experience:', 'soul');

  const entries = Object.entries(CLASSES);
  entries.forEach(([name, def], i) => {
    add(`  <span class="c-cmd">${i + 1}. ${name}</span> — ${def.description}`, 'ability');
    const st = def.baseStats;
    add(`     HP ${st.maxHp}  AGO ${st.agony}  ESS ${st.essence}  SPD ${st.speed}`, 'system');
  });

  add('');
  add('Type <span class="c-cmd">1</span>, <span class="c-cmd">2</span>, or <span class="c-cmd">3</span> to choose.', 'system');

  function handler(e) {
    if (e.key !== 'Enter') return;
    const val = inputEl.value.trim();
    inputEl.value = '';

    const idx = parseInt(val) - 1;
    if (!entries[idx]) { add('Enter 1, 2, or 3.', 'warn'); return; }
    const chosenClass = entries[idx][0];
    inputEl.removeEventListener('keydown', handler);
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
  game._log(`║  ${playerName} the ${className} enters the dark.`.padEnd(44) + '║');
  game._log('╚══════════════════════════════════════════╝');
  game._log('Type <span class="c-cmd">help</span> for commands. Arrow keys or n/s/e/w to move.', 'system');

  // Text command handler — empty Enter = confirm pending movement
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = inputEl.value.trim();
      inputEl.value = '';
      if (!cmd) {
        if (game.getState()?.preview?.path?.length > 0) {
          game._log('<span class="c-prompt">&gt;</span> confirm', 'input');
          game.processCommand('confirm');
        }
        return;
      }
      game._log(`<span class="c-prompt">&gt;</span> ${cmd}`, 'input');
      game.processCommand(cmd);
    }
  });

  // Arrow key movement — captured at document level so they always fire
  const ARROW_DIR = {
    ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e',
  };
  document.addEventListener('keydown', (e) => {
    const dir = ARROW_DIR[e.key];
    if (!dir) return;
    e.preventDefault(); // stop page scroll
    if (game.getState()?.phase !== 'player') return;
    game._log(`<span class="c-prompt">&gt;</span> ${e.key.replace('Arrow', '').toLowerCase()}`, 'input');
    game.processCommand(dir);
  });

  inputEl.focus();
}
