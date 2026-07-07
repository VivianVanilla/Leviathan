// renderer.js — ASCII rendering engine for LEVIATHAN

import { DODGE_BOX } from './battle.js';
import { ABILITIES }  from './abilities.js';

const SUP = ['', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

export class Renderer {
  constructor(mapEl, hudEl, logEl, abilityHintEl) {
    this.mapEl         = mapEl;
    this.hudEl         = hudEl;
    this.logEl         = logEl;
    this.abilityHintEl = abilityHintEl;
    this.frame         = 0;
    this._timer        = null;
  }

  startAnimation(getState) {
    this._timer = setInterval(() => {
      this.frame = (this.frame + 1) % 8;
      const s = getState();
      if (!s) return;
      if (s.phase === 'battle') this.renderBattle(s);
      else                      this.renderMap(s);
    }, 400);
  }

  stopAnimation() { clearInterval(this._timer); }

  render(state) {
    this.renderHUD(state);
    if (state.phase === 'battle') this.renderBattle(state);
    else                          this.renderMap(state);
  }

  // ── HUD ──────────────────────────────────────────────────────────────────

  renderHUD(state) {
    const p     = state.player;
    const maxMp = p.maxMp;
    const hpBar = this._bar(p.hp, p.maxHp, 14, '█', '░', 'c-hp');
    const mpBar = this._bar(p.mp, maxMp,   14, '█', '░', 'c-mp');
    const xpBar = this._bar(p.xp, p.maxXp, 10, '█', '░', 'c-essence');

    const effectText = p.statusEffects.length
      ? ' · ' + p.statusEffects.map(e => `<span class="c-agony">[${e.type}·${e.remaining}]</span>`).join(' ')
      : '';

    this.hudEl.innerHTML =
      `<span class="c-player">${p.name}</span> · ` +
      `<span class="c-class">${p.class}</span>` + '\n' +
      `HP ${hpBar} <span class="c-hp">${p.hp}/${p.maxHp}</span>  ` +
      `MP ${mpBar} <span class="c-mp">${p.mp}/${maxMp}</span>  ` +
      `XP ${xpBar} <span class="c-essence">${p.xp}/${p.maxXp}</span>` +
      effectText;
  }

  // ── Overworld map ─────────────────────────────────────────────────────────

  renderMap(state) {
    const { map, entities, player, trail = [], floorItems = [] } = state;

    const trailMap = new Map();
    trail.forEach((t, i) => {
      const k = `${t.x},${t.y}`;
      if (!trailMap.has(k)) trailMap.set(k, i);
    });

    const over = new Map();
    for (const it of floorItems) {
      over.set(`${it.x},${it.y}`, { label: '✦', cls: 'c-item' });
    }

    const typeCount = {}, typeSeq = {};
    for (const e of entities) {
      if (e.hp > 0) typeCount[e.type] = (typeCount[e.type] || 0) + 1;
    }
    for (const e of entities) {
      if (e.hp <= 0) continue;
      typeSeq[e.type] = (typeSeq[e.type] || 0) + 1;
      const num = typeCount[e.type] > 1 ? SUP[Math.min(typeSeq[e.type], 9)] : '';
      const fi  = this.frame % e.sprite.frames.length;
      const cls = e.isBoss ? 'c-boss' : 'c-enemy';

      if (e.sprite.height > 1) {
        for (let dy = 0; dy < e.sprite.height; dy++) {
          const row = e.sprite.frames[fi][dy] || '';
          for (let dx = 0; dx < e.sprite.width; dx++) {
            const ch    = row[dx] || ' ';
            const label = (dx === 0 && dy === 0 && num) ? ch + num : ch;
            over.set(`${e.x + dx},${e.y + dy}`, { label, cls });
          }
        }
      } else {
        const ch = e.sprite.frames[fi] || '?';
        over.set(`${e.x},${e.y}`, { label: ch + num, cls });
      }
    }

    const pfi = this.frame % player.sprite.frames.length;
    over.set(`${player.x},${player.y}`, { label: player.sprite.frames[pfi], cls: 'c-player' });

    const rows = [];
    for (let y = 0; y < map.height; y++) {
      let row = '';
      for (let x = 0; x < map.width; x++) {
        const key = `${x},${y}`;
        if (over.has(key)) {
          const { label, cls } = over.get(key);
          row += `<span class="${cls}">${this._esc(label)}</span>`;
        } else if (trailMap.has(key)) {
          const age = Math.min(trailMap.get(key) + 1, 4);
          row += `<span class="c-trail-${age}">·</span>`;
        } else {
          row += this._tile(map.getTile(x, y));
        }
      }
      rows.push(row);
    }

    this.mapEl.innerHTML = rows.join('\n');
  }

  // ── Battle screen ─────────────────────────────────────────────────────────

  renderBattle(state) {
    const bt    = state.battle;
    if (!bt) return;
    const enemy = bt.enemy;
    const p     = state.player;
    const cls   = enemy.isBoss ? 'c-boss' : 'c-enemy';
    const flash = bt.hitFlash > 0;
    const eCls  = flash ? 'c-hit' : cls;

    const lines = [];

    lines.push('');
    const hpBar = this._bar(enemy.hp, enemy.maxHp, 18, '█', '░', eCls);
    lines.push(
      `  <span class="${eCls}">${this._esc(enemy.name.toUpperCase())}</span>` +
      `   HP ${hpBar} <span class="${eCls}">${enemy.hp}/${enemy.maxHp}</span>`
    );
    lines.push('');

    const spr = enemy.encounter?.largeSprite ?? [enemy.sprite.frames[0] ?? '?'];
    for (const sl of spr) {
      lines.push(`      <span class="${eCls}">${this._esc(sl)}</span>`);
    }
    lines.push('');

    if (bt.dialogue) {
      lines.push(`  <span class="c-muted">"${this._esc(bt.dialogue)}"</span>`);
      lines.push('');
    }

    const BW = DODGE_BOX.W, BH = DODGE_BOX.H;
    const sX = bt.soul.x, sY = bt.soul.y;

    const bulletAt = new Map();
    for (const b of bt.bullets) {
      const bx = Math.round(b.x), by = Math.round(b.y);
      if (bx >= 0 && bx < BW && by >= 0 && by < BH) bulletAt.set(`${bx},${by}`, b);
    }

    const soulFlashing = bt.soulFlash > 0 && Math.floor(bt.soulFlash / 2) % 2 === 0;
    const isPlayerTurn = bt.turnPhase === 'player';
    const phaseLabel   = isPlayerTurn
      ? '<span class="c-buff">★ YOUR TURN ★</span>'
      : `<span class="c-muted">DODGE  ${bt.dodgeTicks}</span>`;

    lines.push('  ┌' + '─'.repeat(BW) + '┐');
    for (let y = 0; y < BH; y++) {
      let row = '  │';
      for (let x = 0; x < BW; x++) {
        const k = `${x},${y}`;
        if (x === sX && y === sY) {
          row += soulFlashing
            ? '<span class="bt-soul-hit">✦</span>'
            : '<span class="bt-soul">⦿</span>';
        } else if (bulletAt.has(k)) {
          const b = bulletAt.get(k);
          const bStyle = bt.enemyColor ? ` style="color:${bt.enemyColor}"` : '';
          row += `<span class="${b.cls}"${bStyle}>${this._esc(b.char)}</span>`;
        } else {
          row += ' ';
        }
      }
      row += '│';
      if (y === 0) row += `  ${phaseLabel}`;
      if (isPlayerTurn) {
        if (y === 3) row += `  <span class="c-cmd">type ability name to attack</span>`;
        if (y === 4) row += `  <span class="c-cmd">or type 'flee'</span>`;
      } else {
        if (y === 3) row += `  <span class="c-muted">arrows: dodge</span>`;
      }
      lines.push(row);
    }
    lines.push('  └' + '─'.repeat(BW) + '┘');

    lines.push('');
    lines.push('  ' + p.abilities.map(key => {
      const ab = ABILITIES[key];
      const mp = ab?.mpCost > 0 ? `<span class="c-mp">${ab.mpCost}mp</span>` : '';
      return `<span class="c-cmd">${key}</span>${mp ? ' '+mp : ''}`;
    }).join('   '));

    this.mapEl.innerHTML = lines.join('\n');
  }

  // ── Ability hints (left panel) ────────────────────────────────────────────

  updateAbilityHints(player, ABILITIES) {
    if (!this.abilityHintEl) return;
    let html = '';
    player.abilities.forEach((key, i) => {
      const ab = ABILITIES[key];
      if (!ab) return;
      const cost = ab.mpCost > 0 ? `<span class="ab-cost">${ab.mpCost}mp</span> ` : '';
      html += `<div class="ab-entry">` +
        `<div><span class="ab-name">[${i+1}] ${key}</span> ${cost}</div>` +
        `<div class="ab-desc">${ab.description}</div>` +
        `</div>`;
    });
    this.abilityHintEl.innerHTML = html || '<span class="c-muted">none</span>';
  }

  // ── Log ───────────────────────────────────────────────────────────────────

  addLog(html, type = 'normal') {
    const line = document.createElement('div');
    line.className = `log-${type}`;
    line.innerHTML = html;
    this.logEl.appendChild(line);
    while (this.logEl.children.length > 100) this.logEl.removeChild(this.logEl.firstChild);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  clearLog() { this.logEl.innerHTML = ''; }

  // ── Tile + helpers ────────────────────────────────────────────────────────

  _tile(ch) {
    switch (ch) {
      case '#': return `<span class="c-wall">█</span>`;
      case '.': return `<span class="c-floor">·</span>`;
      case '+': return `<span class="c-door">+</span>`;
      case '~': return `<span class="c-water">≈</span>`;
      case '>': return `<span class="c-exit">></span>`;
      default:  return `<span class="c-floor"> </span>`;
    }
  }

  _bar(cur, max, len, fill, empty, cls) {
    const n = max > 0 ? Math.round(Math.max(0, cur / max) * len) : 0;
    return `<span class="${cls}">${fill.repeat(n)}${empty.repeat(len - n)}</span>`;
  }

  _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
