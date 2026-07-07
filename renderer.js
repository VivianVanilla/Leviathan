// renderer.js — ASCII rendering engine for LEVIATHAN
// Handles: HUD, map (solid walls, animated sprites, movement trail),
//          combat log, enemy health panel (right), ability hints (left)

const SUP = ['', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

export class Renderer {
  constructor(mapEl, hudEl, logEl, enemyPanelEl, abilityHintEl) {
    this.mapEl         = mapEl;
    this.hudEl         = hudEl;
    this.logEl         = logEl;
    this.enemyPanelEl  = enemyPanelEl;
    this.abilityHintEl = abilityHintEl;
    this.frame         = 0;
    this._timer        = null;
  }

  startAnimation(getState) {
    this._timer = setInterval(() => {
      this.frame = (this.frame + 1) % 8;
      const state = getState();
      if (state) {
        this.renderMap(state);
        this.renderEnemyPanel(state);
      }
    }, 400);
  }

  stopAnimation() {
    if (this._timer) clearInterval(this._timer);
  }

  render(state) {
    this.renderHUD(state);
    this.renderMap(state);
    this.renderEnemyPanel(state);
  }

  // ── HUD ──────────────────────────────────────────────────────────────────

  renderHUD(state) {
    const p     = state.player;
    const maxMp = p.maxMp;
    const hpBar = this._bar(p.hp, p.maxHp, 14, '█', '░', 'c-hp');
    const mpBar = this._bar(p.mp, maxMp,   14, '█', '░', 'c-mp');

    const actGlyph = state.actLeft > 0
      ? `<span class="c-cmd">■</span>`
      : `<span class="c-turn">□</span>`;

    const effectText = p.statusEffects.length
      ? ' · ' + p.statusEffects.map(e =>
          `<span class="c-agony">[${e.type}·${e.remaining}]</span>`).join(' ')
      : '';

    const targetText = state.target && state.target.hp > 0
      ? `  ⟶ <span class="c-enemy">${state.target.name}</span> ` +
        this._bar(state.target.hp, state.target.maxHp, 8, '█', '░', 'c-agony')
      : '';

    this.hudEl.innerHTML =
      `<span class="c-player">${p.name}</span> · ` +
      `<span class="c-class">${p.class}</span> · ` +
      `Turn <span class="c-turn">${state.turn}</span>` +
      targetText + '\n' +
      `HP ${hpBar} <span class="c-hp">${p.hp}/${p.maxHp}</span>  ` +
      `MP ${mpBar} <span class="c-mp">${p.mp}/${maxMp}</span>  ` +
      `MOVEMENT <span class="c-stat">${state.movLeft}/${p.speed}</span>  ` +
      `ACT ${actGlyph}  ` +
      `AGONY <span class="c-agony">${p.agony}</span>  ` +
      `ESSENCE <span class="c-essence">${p.essence}</span>` +
      effectText;
  }

  // ── MAP ──────────────────────────────────────────────────────────────────

  renderMap(state) {
    const { map, entities, player, trail = [] } = state;

    // Trail lookup: key → age index (0 = most recent)
    const trailMap = new Map();
    trail.forEach((t, i) => {
      const k = `${t.x},${t.y}`;
      if (!trailMap.has(k)) trailMap.set(k, i);
    });

    // Entity cell overrides — count per type for superscript numbering
    const typeCount = {}, typeSeq = {};
    for (const e of entities) {
      if (e.hp > 0) typeCount[e.type] = (typeCount[e.type] || 0) + 1;
    }

    const over = new Map();
    for (const e of entities) {
      if (e.hp <= 0) continue;
      typeSeq[e.type] = (typeSeq[e.type] || 0) + 1;
      const num = typeCount[e.type] > 1 ? SUP[Math.min(typeSeq[e.type], 9)] : '';
      const fi  = this.frame % e.sprite.frames.length;
      const cls = e.isBoss ? 'c-boss' : 'c-enemy';

      if (e.sprite.height > 1) {
        for (let dy = 0; dy < e.sprite.height; dy++) {
          const rowStr = e.sprite.frames[fi][dy] || '';
          for (let dx = 0; dx < e.sprite.width; dx++) {
            const ch    = rowStr[dx] || ' ';
            const label = (dx === 0 && dy === 0 && num) ? ch + num : ch;
            over.set(`${e.x + dx},${e.y + dy}`, { label, cls });
          }
        }
      } else {
        const ch = e.sprite.frames[fi] || '?';
        over.set(`${e.x},${e.y}`, { label: ch + num, cls });
      }
    }

    // Player on top
    const pfi = this.frame % player.sprite.frames.length;
    over.set(`${player.x},${player.y}`, {
      label: player.sprite.frames[pfi],
      cls: 'c-player',
    });

    // Ghost preview: planned-but-unconfirmed movement path
    const preview = state.preview;
    if (preview?.path?.length > 0) {
      for (let i = 0; i < preview.path.length - 1; i++) {
        const pos = preview.path[i];
        const k = `${pos.x},${pos.y}`;
        if (!over.has(k)) over.set(k, { label: '·', cls: 'c-ghost-path' });
      }
      if (preview.cursor) {
        const k = `${preview.cursor.x},${preview.cursor.y}`;
        if (k !== `${player.x},${player.y}`) {
          over.set(k, { label: player.sprite.frames[pfi], cls: 'c-ghost-player' });
        }
      }
    }

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

  // ── ENEMY PANEL (right) ───────────────────────────────────────────────────

  renderEnemyPanel(state) {
    if (!this.enemyPanelEl) return;
    const alive = state.entities.filter(e => e.hp > 0);

    if (!alive.length) {
      this.enemyPanelEl.innerHTML = '<span class="c-muted">area clear</span>';
      return;
    }

    const typeCount = {}, typeSeq = {};
    for (const e of alive) typeCount[e.type] = (typeCount[e.type] || 0) + 1;

    let html = '';
    for (const e of alive) {
      typeSeq[e.type] = (typeSeq[e.type] || 0) + 1;
      const num      = typeCount[e.type] > 1 ? SUP[Math.min(typeSeq[e.type], 9)] : '';
      const fi       = this.frame % e.sprite.frames.length;
      const cls      = e.isBoss ? 'c-boss' : 'c-enemy';
      const isTgt    = state.target === e;
      const isActive = state.activeEnemy === e.id;
      const dist     = Math.abs(state.player.x - e.x) + Math.abs(state.player.y - e.y);

      const dispCh = typeof e.sprite.frames[fi] === 'string'
        ? e.sprite.frames[fi][0]
        : (e.sprite.frames[fi][0]?.[0] ?? '?');

      const hpBar = this._bar(e.hp, e.maxHp, 10, '█', '░', cls);

      html += `<div class="init-entry${isActive ? ' init-active' : ''}${isTgt ? ' targeted' : ''}">`;
      html += `<span class="${cls}">${this._esc(dispCh)}${num}</span> `;
      html += `<span class="${cls}">${this._esc(e.name)}</span>`;
      if (e.enraged) html += ` <span class="enemy-enraged">!</span>`;
      html += `\n<div class="enemy-hp-row">${hpBar} ${e.hp}/${e.maxHp}</div>`;
      html += `<div class="enemy-dist">dist ${dist}</div>`;
      html += `</div>`;
    }

    this.enemyPanelEl.innerHTML = html;
  }

  // ── ABILITY HINTS (left panel, populated once on game start) ──────────────

  updateAbilityHints(player, ABILITIES) {
    if (!this.abilityHintEl) return;
    let html = '';
    for (const key of player.abilities) {
      const ab = ABILITIES[key];
      if (!ab) continue;
      const cost = ab.mpCost > 0 ? `<span class="ab-cost">${ab.mpCost}mp</span> ` : '';
      html += `<div class="ab-entry">` +
        `<div><span class="ab-name">${key}</span> ${cost}</div>` +
        `<div class="ab-desc">${ab.description.slice(0, 36)}</div>` +
        `</div>`;
    }
    this.abilityHintEl.innerHTML = html || '<span class="c-muted">none</span>';
  }

  // ── LOG ───────────────────────────────────────────────────────────────────

  addLog(html, type = 'normal') {
    const line = document.createElement('div');
    line.className = `log-${type}`;
    line.innerHTML = html;
    this.logEl.appendChild(line);
    while (this.logEl.children.length > 80) {
      this.logEl.removeChild(this.logEl.firstChild);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  clearLog() { this.logEl.innerHTML = ''; }

  // ── TILE + HELPERS ────────────────────────────────────────────────────────

  _tile(ch) {
    switch (ch) {
      case '#': return `<span class="c-wall">█</span>`;
      case '.': return `<span class="c-floor">·</span>`;
      case '+': return `<span class="c-door">+</span>`;
      case '~': return `<span class="c-water">≈</span>`;
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
