// battle.js — Turn-based battle system for LEVIATHAN
//
// Turn flow:
//   dodge phase → bullets fly, player dodges for dodgeDuration ticks
//   player phase → bullets cleared, player attacks/flees; attack returns to dodge phase
//
// EXTEND bullet patterns: add a function to PATTERNS below.
//   Signature: (tick, soulX, soulY, W, H) → newBullet[]
//   Bullet fields: { x:float, y:float, dx:float, dy:float, char, cls }
//   Register the key in an enemy's encounter.patterns array in enemies.js.
//
// Speed modifier: set encounter.speed (default 1.0) on an enemy to scale all bullet velocities.
//   e.g. speed: 2.0 makes all patterns twice as fast.

import { ABILITIES } from './abilities.js';

// ── Dodge box dimensions ──────────────────────────────────────────────────────
export const DODGE_BOX = { W: 30, H: 10 };

const rand  = n => Math.floor(Math.random() * n);

function randomEnemyColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue},90%,65%)`;
}

// ── Bullet patterns ───────────────────────────────────────────────────────────
// Speeds are tuned for an 80ms tick at speed 1.0.
export const PATTERNS = {

  scatter(tick, sx, sy, W, H) {
    if (tick % 8 !== 0) return [];
    const out = [];
    for (let i = 0; i < 4; i++) {
      const side = rand(4);
      if      (side === 0) out.push({ x: rand(W),   y: 0,     dx:  (Math.random()-.5)*.16, dy:  .30, char: '▼', cls: 'bt-b' });
      else if (side === 1) out.push({ x: rand(W),   y: H - 1, dx:  (Math.random()-.5)*.16, dy: -.30, char: '▲', cls: 'bt-b' });
      else if (side === 2) out.push({ x: 0,         y: rand(H), dx:  .30, dy: (Math.random()-.5)*.16, char: '▶', cls: 'bt-b' });
      else                 out.push({ x: W - 1,     y: rand(H), dx: -.30, dy: (Math.random()-.5)*.16, char: '◀', cls: 'bt-b' });
    }
    return out;
  },

  aimed(tick, sx, sy, W, H) {
    if (tick % 14 !== 0) return [];
    const ox = rand(W);
    const oy = rand(2) === 0 ? 0 : H - 1;
    const d  = Math.hypot(sx - ox, sy - oy) || 1;
    return [{ x: ox, y: oy, dx: (sx - ox) / d * .38, dy: (sy - oy) / d * .38, char: '◆', cls: 'bt-fast' }];
  },

  wave(tick, sx, sy, W, H) {
    if (tick % 7 !== 0) return [];
    const row = Math.floor(tick / 7) % H;
    return [
      { x: 0,     y: row,         dx:  .35, dy: 0, char: '─', cls: 'bt-b' },
      { x: W - 1, y: H - 1 - row, dx: -.35, dy: 0, char: '─', cls: 'bt-b' },
    ];
  },

  crossfire(tick, sx, sy, W, H) {
    if (tick % 12 !== 0) return [];
    const y = rand(H);
    return [
      { x: 0,     y,             dx:  .37, dy: 0, char: '─', cls: 'bt-b' },
      { x: W - 1, y: H - 1 - y, dx: -.37, dy: 0, char: '─', cls: 'bt-b' },
    ];
  },

  rain(tick, sx, sy, W, H) {
    if (tick % 5 !== 0) return [];
    return [{ x: rand(W), y: 0, dx: 0, dy: .27, char: '|', cls: 'bt-b' }];
  },

  spiral(tick, sx, sy, W, H) {
    if (tick % 4 !== 0) return [];
    const cx = W / 2, cy = H / 2;
    const angle = tick * .19;
    const r  = Math.min(cx, cy) - 2;
    const ox = cx + Math.cos(angle) * r;
    const oy = cy + Math.sin(angle) * r * .6;
    if (ox < 0 || ox >= W || oy < 0 || oy >= H) return [];
    return [{
      x: ox, y: oy,
      dx: Math.cos(angle + Math.PI / 2) * .29,
      dy: Math.sin(angle + Math.PI / 2) * .20,
      char: '*', cls: 'bt-b',
    }];
  },

  chaos(tick, sx, sy, W, H) {
    const out = [];
    if (tick % 5 === 0)  out.push(...PATTERNS.scatter(tick, sx, sy, W, H));
    if (tick % 16 === 0) out.push(...PATTERNS.aimed(tick, sx, sy, W, H));
    return out;
  },

};

// ── Battle System ─────────────────────────────────────────────────────────────

export class BattleSystem {
  constructor(engine) {
    this.engine      = engine;
    this._tickHandle = null;
  }

  get s()                    { return this.engine.state; }
  _log(html, type = 'normal') { this.engine._log(html, type); }
  _render()                   { this.engine.renderer.render(this.s); }

  // ── Start ──────────────────────────────────────────────────────────────────

  start(enemy) {
    const s   = this.s;
    const enc = enemy.encounter || {};

    const idx = s.entities.indexOf(enemy);
    if (idx !== -1) s.entities.splice(idx, 1);

    const patterns      = enc.patterns?.length ? [...enc.patterns] : ['scatter'];
    const dodgeDuration = enc.dodgeDuration ?? 90;
    const speed         = enc.speed ?? 1.0;

    s.battle = {
      enemy,
      enemyColor:    randomEnemyColor(),
      soul:          { x: Math.floor(DODGE_BOX.W / 2), y: Math.floor(DODGE_BOX.H / 2) },
      bullets:       [],
      patternTick:   0,
      patterns,
      patternIdx:    0,
      speed,
      hitFlash:      0,
      soulFlash:     0,
      dialogue:      enc.dialogue ? enc.dialogue[rand(enc.dialogue.length)] : null,
      turnPhase:     'dodge',
      dodgeTicks:    dodgeDuration,
      dodgeDuration,
    };

    s.phase = 'battle';

    this._log('─'.repeat(42), 'divider');
    const cls = enemy.isBoss ? 'c-boss' : 'c-enemy';
    this._log(`<span class="${cls}">⚔  ${enemy.name}</span>`, enemy.isBoss ? 'boss' : 'enemy');
    if (s.battle.dialogue) {
      this._log(`<span class="c-muted">"${s.battle.dialogue}"</span>`, 'system');
    }
    this._log(
      '<span class="c-muted">Dodge phase: use arrows · Your turn: type ability name or "flee"</span>',
      'system'
    );

    this._render();
    this._startTick();
  }

  // ── Player actions ────────────────────────────────────────────────────────

  attack(abilitySlot) {
    const s = this.s;
    if (s.phase !== 'battle') return;
    const bt = s.battle;

    if (bt.turnPhase !== 'player') {
      this._log('<span class="c-muted">Dodge the bullets first!</span>', 'warn');
      return;
    }

    const p     = s.player;
    const enemy = bt.enemy;
    const key   = p.abilities[abilitySlot];
    const ab    = key ? ABILITIES[key] : null;

    if (!ab) {
      this._log('<span class="c-muted">No ability in that slot.</span>', 'warn');
      return;
    }
    if (ab.type === 'teleport') {
      this._log('<span class="c-muted">Can\'t teleport during battle.</span>', 'warn');
      return;
    }
    if (p.mp < ab.mpCost) {
      this._log(`<span class="c-mp">Not enough MP (${ab.name} costs ${ab.mpCost}).</span>`, 'warn');
      return;
    }
    p.mp -= ab.mpCost;

    if (ab.type === 'buff') {
      if (ab.effect) {
        p[ab.effect.stat] += ab.effect.amount;
        p.statusEffects.push({
          type:      ab.effect.stat + '_buff',
          stat:      ab.effect.stat,
          amount:    ab.effect.amount,
          remaining: ab.effect.duration,
        });
      }
      this._log(`<span class="c-buff">⬆ ${ab.name}: ${ab.description}</span>`, 'buff');
      this._nextDodgePhase();
      this._render();
      return;
    }

    const dmg  = Math.floor(ab.damage(p));
    const name = ab.name;

    if (ab.drain) {
      const heal = Math.max(1, Math.floor(dmg * ab.drain));
      p.hp = Math.min(p.maxHp, p.hp + heal);
      this._log(`<span class="c-heal">♥ +${heal} HP</span>`, 'heal');
    }

    enemy.hp -= dmg;
    bt.hitFlash = 5;

    const hitCls = dmg >= 25 ? 'c-crit' : 'c-hit';
    const eCls   = enemy.isBoss ? 'c-boss' : 'c-enemy';
    this._log(
      `<span class="c-cmd">${name}</span> → ` +
      `<span class="${eCls}">${enemy.name}</span> ` +
      `<span class="${hitCls}">−${dmg}</span>`,
      'ability'
    );

    if (enemy.hp <= 0) { enemy.hp = 0; this._end('victory'); return; }

    this._nextDodgePhase();
    this._render();
  }

  _nextDodgePhase() {
    const bt = this.s.battle;
    bt.patternIdx  = (bt.patternIdx + 1) % bt.patterns.length;
    bt.patternTick = 0;
    bt.dodgeTicks  = bt.dodgeDuration;
    bt.turnPhase   = 'dodge';
  }

  giveItem(nameFragment) {
    const s  = this.s;
    const bt = s.battle;
    if (!bt || !nameFragment) {
      return this._log('Usage: give &lt;item name&gt;', 'warn');
    }

    const idx = s.player.inventory.findIndex(
      it => it.id.includes(nameFragment) || it.name.toLowerCase().includes(nameFragment.toLowerCase())
    );
    if (idx === -1) {
      return this._log(`You don't have anything matching "${nameFragment}".`, 'warn');
    }

    const item     = s.player.inventory.splice(idx, 1)[0];
    const reaction = bt.enemy.encounter?.acceptedItems?.[item.id];

    if (reaction) {
      this._log(`<span class="c-buff">You offer the ${item.name}.</span>`, 'buff');
      this._log(`<span class="c-muted">"${reaction.dialogue}"</span>`, 'system');
      if (reaction.effect === 'spare')  { this._end('spared'); return; }
      if (reaction.effect === 'weaken') {
        bt.enemy.hp = Math.floor(bt.enemy.hp / 2);
        this._log(`<span class="c-hit">${bt.enemy.name} is weakened.</span>`, 'ability');
      }
    } else {
      this._log(`<span class="c-muted">${bt.enemy.name} ignores the ${item.name}.</span>`, 'system');
    }
    this._render();
  }

  showItems() {
    const inv = this.s.player.inventory;
    if (!inv.length) { this._log('Your inventory is empty.', 'system'); return; }
    this._log('Inventory:', 'system');
    inv.forEach((item, i) => {
      this._log(`  <span class="c-cmd">${i + 1}.</span> <span class="c-buff">${item.name}</span> — ${item.description}`, 'system');
    });
    this._log('Type <span class="c-cmd">give &lt;name&gt;</span> to offer.', 'system');
  }

  flee() {
    const s  = this.s;
    const bt = s.battle;
    if (!bt) return;
    s.entities.push(bt.enemy);
    this._log('<span class="c-muted">You withdraw from battle.</span>', 'system');
    this._end('fled');
  }

  // ── Soul movement ─────────────────────────────────────────────────────────

  moveSoul(dir) {
    const s = this.s;
    if (s.phase !== 'battle') return;
    const bt = s.battle;

    const DIRS = { n: [0,-1], s: [0,1], e: [1,0], w: [-1,0] };
    const d    = DIRS[dir];
    if (!d) return;

    const nx = bt.soul.x + d[0];
    const ny = bt.soul.y + d[1];
    if (nx >= 0 && nx < DODGE_BOX.W && ny >= 0 && ny < DODGE_BOX.H) {
      bt.soul.x = nx;
      bt.soul.y = ny;
    }

    this._render();
  }

  // ── Tick loop ─────────────────────────────────────────────────────────────

  _startTick() {
    clearInterval(this._tickHandle);
    this._tickHandle = setInterval(() => this._tick(), 80);
  }

  _tick() {
    const s = this.s;
    if (s.phase !== 'battle') { clearInterval(this._tickHandle); return; }

    const bt  = s.battle;
    const p   = s.player;
    const spd = bt.speed;

    if (bt.turnPhase === 'player') return;

    // Move bullets (apply speed multiplier)
    bt.bullets = bt.bullets
      .map(b => ({ ...b, x: b.x + b.dx * spd, y: b.y + b.dy * spd }))
      .filter(b => b.x > -1 && b.x < DODGE_BOX.W + 1 && b.y > -1 && b.y < DODGE_BOX.H + 1);

    // Spawn new bullets from current pattern
    const patFn  = PATTERNS[bt.patterns[bt.patternIdx]] || PATTERNS.scatter;
    const newBul = patFn(bt.patternTick, bt.soul.x, bt.soul.y, DODGE_BOX.W, DODGE_BOX.H);
    bt.bullets.push(...newBul);

    // Collision
    if (bt.soulFlash <= 0) {
      for (let i = bt.bullets.length - 1; i >= 0; i--) {
        const b  = bt.bullets[i];
        const bx = Math.round(b.x), by = Math.round(b.y);
        if (bx === bt.soul.x && by === bt.soul.y) {
          const dmg = bt.enemy.encounter?.hitDamage ?? 10;
          p.hp        -= dmg;
          bt.soulFlash = 10;
          bt.bullets.splice(i, 1);
          this._log(`<span class="c-hit">Hit! −${dmg} HP</span>`, 'enemy');
          if (p.hp <= 0) { this._end('dead'); return; }
          break;
        }
      }
    }

    // Tick status effects (buffs expiry — no bleed)
    p.statusEffects = p.statusEffects.filter(eff => {
      eff.remaining--;
      if (eff.remaining <= 0 && eff.stat) p[eff.stat] -= eff.amount;
      return eff.remaining > 0;
    });

    if (bt.hitFlash  > 0) bt.hitFlash--;
    if (bt.soulFlash > 0) bt.soulFlash--;
    bt.patternTick++;
    bt.dodgeTicks--;

    if (bt.dodgeTicks <= 0) {
      bt.bullets   = [];
      bt.turnPhase = 'player';
      this._log('<span class="c-buff">Your turn! Type an ability name to attack, or "flee".</span>', 'system');
    }

    this._render();
  }

  // ── End battle ────────────────────────────────────────────────────────────

  _end(outcome) {
    clearInterval(this._tickHandle);
    this._tickHandle = null;

    const s     = this.s;
    const bt    = s.battle;
    const enemy = bt.enemy;

    if (outcome === 'victory' || outcome === 'spared') {
      if (outcome === 'victory') {
        this._log(`<span class="c-kill">✦ ${enemy.name} defeated.</span>`, 'kill');
      } else {
        this._log(`<span class="c-buff">✦ ${enemy.name} withdraws in peace.</span>`, 'buff');
      }
      const p = s.player;
      p.xp += enemy.xpReward;
      this._log(`<span class="c-essence">+${enemy.xpReward} XP  (${p.xp}/${p.maxXp})</span>`, 'system');
      if (p.xp >= p.maxXp) {
        p.xp    = 0;
        p.maxXp = Math.floor(p.maxXp * 1.6);
        this.engine._offerLevelUp();
      } else if (enemy.isBoss) {
        this.engine._offerLevelUp();
      }
      this.engine.saveGame();

    } else if (outcome === 'dead') {
      s.battle = null;
      s.phase  = 'dead';
      this._log('─'.repeat(42), 'divider');
      this._log('<span class="c-boss">✦  G A M E   O V E R  ✦</span>', 'kill');
      this._log('<span class="c-muted">Press Enter to restart.</span>', 'system');
      this._render();
      return;
    }

    s.battle = null;
    s.phase  = 'player';
    this._log('─'.repeat(42), 'divider');
    this._render();
  }
}
