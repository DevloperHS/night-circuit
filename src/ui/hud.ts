function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function ordinal(n: number): [string, string] {
  const suf = n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH';
  return [String(n), suf];
}

export class HUD {
  private speedBox = document.getElementById('speedBox')!;
  private speedVal = document.getElementById('speedVal')!;
  private speedFill = document.getElementById('speedFill')!;
  private driftTag = document.getElementById('driftTag')!;
  private lapBox = document.getElementById('lapBox')!;
  private posVal = document.getElementById('posVal')!;
  private posSuf = document.getElementById('posSuf')!;
  private posBox = document.getElementById('posBox')!;
  private posDelta = document.getElementById('posDelta')!;
  private timeBox = document.getElementById('timeBox')!;
  private bestBox = document.getElementById('bestBox')!;
  private boostFill = document.getElementById('boostFill')!;
  private boostBar = document.getElementById('boostBar')!;
  private boostLabel = document.getElementById('boostLabel')!;
  private countdownEl = document.getElementById('countdown')!;
  private centerEl = document.getElementById('center')!;
  private overlay = document.getElementById('overlay')!;
  private title = document.getElementById('title')!;
  private subtitle = document.getElementById('subtitle')!;
  private startHint = document.getElementById('startHint')!;
  private finishStats = document.getElementById('finishStats')!;
  private pauseMenu = document.getElementById('pauseMenu')!;
  private centerTimer = 0;
  private lastSpeed = -1;
  private lastRank = 0;
  private posFlashT = 0;
  private lastDrift = false;
  private lastBoosting = false;
  private lastCharge = -1;

  // Gauge scale: 70 m/s boost ceiling → 252 km/h
  private static readonly KMH_MAX = 252;

  setSpeed(kmh: number): void {
    const rounded = Math.round(kmh);
    if (rounded === this.lastSpeed) return;
    this.lastSpeed = rounded;
    this.speedVal.textContent = String(rounded);
    this.speedFill.style.width = `${Math.min(100, (kmh / HUD.KMH_MAX) * 100).toFixed(1)}%`;
  }

  setLap(lap: number): void {
    this.lapBox.innerHTML = `LAP ${lap}<span style="opacity:.55">/3</span>`;
  }

  setPosition(rank: number): void {
    if (rank === this.lastRank) return;
    if (this.lastRank > 0) {
      // position change: pop the plate + show gained/lost arrow briefly
      const gained = rank < this.lastRank;
      this.posDelta.textContent = gained ? '▲' : '▼';
      this.posDelta.className = gained ? 'neon-t' : 'neon-m';
      this.posDelta.style.display = 'block';
      this.posFlashT = 0.9;
      this.posBox.classList.remove('pos-pop');
      void this.posBox.offsetWidth; // restart CSS animation
      this.posBox.classList.add('pos-pop');
    }
    this.lastRank = rank;
    const [num, suf] = ordinal(rank);
    this.posVal.textContent = num;
    this.posSuf.textContent = suf;
    this.posVal.className = rank === 1 ? 'neon-m' : 'neon-t';
    this.posSuf.className = rank === 1 ? 'neon-m' : 'neon-t';
  }

  setDrift(drifting: boolean): void {
    if (drifting === this.lastDrift) return;
    this.lastDrift = drifting;
    this.driftTag.style.display = drifting ? 'block' : 'none';
  }

  setBoost(charge: number, boosting: boolean): void {
    if (boosting !== this.lastBoosting) {
      this.lastBoosting = boosting;
      this.speedBox.classList.toggle('boosting', boosting);
    }
    if (charge !== this.lastCharge) {
      this.lastCharge = charge;
      this.boostFill.style.width = `${Math.round(charge * 100)}%`;
    }
    if (boosting) {
      this.boostBar.classList.remove('ready');
      this.boostLabel.textContent = 'BOOST!';
    } else {
      this.boostBar.classList.toggle('ready', charge > 0.35);
      this.boostLabel.textContent = charge > 0.35 ? 'NITRO READY' : 'NITRO';
    }
  }

  setTime(t: number): void { this.timeBox.textContent = fmtTime(t); }

  setBest(t: number): void {
    this.bestBox.textContent = t > 0 ? `BEST ${fmtTime(t)}` : 'BEST --:--.--';
  }

  countdown(text: string | null): void {
    if (text === null) {
      this.countdownEl.style.display = 'none';
      return;
    }
    this.countdownEl.textContent = text;
    this.countdownEl.className = text === 'GO!' ? 'neon-t cd-pop' : 'neon-m cd-pop';
    this.countdownEl.style.display = 'block';
  }

  center(text: string, ms = 1200): void {
    this.centerEl.innerHTML = text;
    this.centerEl.style.display = 'block';
    this.centerTimer = ms / 1000;
  }

  tick(dt: number): void {
    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) this.centerEl.style.display = 'none';
    }
    if (this.posFlashT > 0) {
      this.posFlashT -= dt;
      if (this.posFlashT <= 0) this.posDelta.style.display = 'none';
    }
  }

  // ---- minimap ----
  private mmDots: HTMLDivElement[] = [];
  private mmLastX: number[] = [];
  private mmLastZ: number[] = [];
  private mmScale = 1;
  private mmOffX = 0;
  private mmOffY = 0;

  /**
   * Build the minimap once: fits the track loop into the panel, draws the
   * road path + start/finish tick, and creates one dot per car (colors match
   * each car's neon glow; playerIndex gets the ringed player marker).
   */
  buildMinimap(points: Array<{ x: number; z: number }>, colors: string[], playerIndex: number): void {
    const wrap = document.getElementById('minimap');
    const svg = document.getElementById('mmSvg');
    const glow = document.getElementById('mmRoadGlow') as SVGPathElement | null;
    const road = document.getElementById('mmRoad') as SVGPathElement | null;
    const start = document.getElementById('mmStart') as SVGLineElement | null;
    if (!wrap || !svg || !glow || !road || !start) return;

    // world bounds -> panel fit (world +x = panel right, +z = panel down)
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const W = wrap.clientWidth || 208;
    const H = wrap.clientHeight || 186;
    const pad = 22;
    this.mmScale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
    this.mmOffX = (W - (maxX - minX) * this.mmScale) / 2 - minX * this.mmScale;
    this.mmOffY = (H - (maxZ - minZ) * this.mmScale) / 2 - minZ * this.mmScale;

    const mx = (x: number): number => x * this.mmScale + this.mmOffX;
    const my = (z: number): number => z * this.mmScale + this.mmOffY;

    // road outline, subsampled to ~170 points (built once, never per frame)
    const step = Math.max(1, Math.floor(points.length / 170));
    let d = '';
    for (let i = 0; i < points.length; i += step) {
      d += (d ? ' L' : 'M') + mx(points[i].x).toFixed(1) + ' ' + my(points[i].z).toFixed(1);
    }
    d += ' Z';
    road.setAttribute('d', d);
    glow.setAttribute('d', d);

    // start/finish tick across the road at sample 0 (travel dir = p1 - p0)
    const ddx = points[1].x - points[0].x;
    const ddz = points[1].z - points[0].z;
    const dl = Math.hypot(ddx, ddz) || 1;
    const halfPx = 8; // half-width of the tick in panel px (~road half width)
    const sx = mx(points[0].x), sy = my(points[0].z);
    const pxn = -ddz / dl, pyn = ddx / dl; // perpendicular to travel
    start.setAttribute('x1', (sx + pxn * halfPx).toFixed(1));
    start.setAttribute('y1', (sy + pyn * halfPx).toFixed(1));
    start.setAttribute('x2', (sx - pxn * halfPx).toFixed(1));
    start.setAttribute('y2', (sy - pyn * halfPx).toFixed(1));

    // one dot per car
    const frag = document.createDocumentFragment();
    for (let i = 0; i < colors.length; i++) {
      const dot = document.createElement('div');
      if (i === playerIndex) {
        dot.className = 'mm-dot player';
      } else {
        dot.className = 'mm-dot';
        dot.style.background = colors[i];
        dot.style.boxShadow = `0 0 6px ${colors[i]}, 0 0 12px ${colors[i]}`;
      }
      this.mmDots.push(dot);
      this.mmLastX.push(NaN);
      this.mmLastZ.push(NaN);
      frag.appendChild(dot);
    }
    wrap.appendChild(frag);
  }

  /** Per-car minimap dot sync — allocation-free, cached DOM writes. */
  setMinimapDot(i: number, x: number, z: number): void {
    const dot = this.mmDots[i];
    if (!dot) return;
    const px = Math.round((x * this.mmScale + this.mmOffX) * 2) / 2;
    const py = Math.round((z * this.mmScale + this.mmOffY) * 2) / 2;
    if (px === this.mmLastX[i] && py === this.mmLastZ[i]) return;
    this.mmLastX[i] = px;
    this.mmLastZ[i] = py;
    dot.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`;
  }

  // ---- leaderboard ----
  // Row height must match the .lb-row CSS height.
  private static readonly LB_ROW_H = 27;
  private lbRows: Array<{
    root: HTMLDivElement; pos: HTMLSpanElement; gap: HTMLSpanElement;
    lastRank: number; lastGap: string;
  }> = [];

  /**
   * Build the leaderboard once: one row per car (colors = car neon glow,
   * playerIndex gets the highlighted "me" row). Rows are absolutely
   * positioned and translate to their rank slot, so position swaps animate.
   */
  buildLeaderboard(names: string[], colors: string[], playerIndex: number): void {
    const wrap = document.getElementById('lb');
    if (!wrap) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < names.length; i++) {
      const root = document.createElement('div');
      root.className = 'lb-row' + (i === playerIndex ? ' me' : '');
      const pos = document.createElement('span');
      pos.className = 'lb-pos';
      const swatch = document.createElement('span');
      swatch.className = 'lb-swatch';
      swatch.style.background = colors[i];
      swatch.style.boxShadow = `0 0 6px ${colors[i]}`;
      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = names[i];
      const gap = document.createElement('span');
      gap.className = 'lb-gap';
      root.append(pos, swatch, name, gap);
      this.lbRows.push({ root, pos, gap, lastRank: 0, lastGap: '' });
      frag.appendChild(root);
    }
    wrap.appendChild(frag);
  }

  /** Move car i's row to its rank slot (P1 at top). Cached write. */
  setLeaderboardSlot(i: number, rank: number): void {
    const row = this.lbRows[i];
    if (!row || rank === row.lastRank) return;
    row.lastRank = rank;
    row.pos.textContent = 'P' + rank;
    row.root.style.transform = `translateY(${(rank - 1) * HUD.LB_ROW_H}px)`;
  }

  /** Live time gap for car i vs the leader; leader shows LEAD. Cached write. */
  setLeaderboardGap(i: number, seconds: number, isLeader: boolean): void {
    const row = this.lbRows[i];
    if (!row) return;
    const text = isLeader ? 'LEAD' : '+' + Math.min(Math.max(seconds, 0), 99.9).toFixed(1) + 's';
    if (text === row.lastGap) return;
    row.lastGap = text;
    row.gap.textContent = text;
  }

  showStart(): void {
    this.overlay.style.display = 'flex';
    this.title.style.display = 'block';
    this.subtitle.style.display = 'block';
    this.startHint.style.display = 'block';
    this.finishStats.style.display = 'none';
    this.pauseMenu.style.display = 'none';
    this.startHint.textContent = 'PRESS ENTER';
  }

  showFinish(rank: number, total: number, best: number): void {
    this.overlay.style.display = 'flex';
    this.title.style.display = 'none';
    this.subtitle.textContent = 'RACE COMPLETE';
    this.subtitle.style.display = 'block';
    this.startHint.style.display = 'none';
    const [num, suf] = ordinal(rank);
    this.finishStats.innerHTML =
      `<span class="${rank === 1 ? 'neon-m' : 'neon-t'}" style="font-size:64px;font-weight:800;font-style:italic">${num}<span style="font-size:28px">${suf}</span> PLACE</span>` +
      `<br>TOTAL ${fmtTime(total)} · BEST LAP ${best > 0 ? fmtTime(best) : '--'}` +
      `<br><span style="opacity:.7">PRESS R TO RESTART</span>`;
    this.finishStats.style.display = 'block';
    this.pauseMenu.style.display = 'none';
  }

  /** Pause screen: hides start/finish content, shows RESUME/RESTART menu. */
  showPause(): void {
    this.overlay.style.display = 'flex';
    this.title.style.display = 'none';
    this.subtitle.style.display = 'none';
    this.startHint.style.display = 'none';
    this.finishStats.style.display = 'none';
    this.pauseMenu.style.display = 'flex';
  }

  hidePause(): void {
    this.pauseMenu.style.display = 'none';
    this.overlay.style.display = 'none';
  }

  /** Wire the pause menu buttons (mouse/touch); keyboard is handled in Game. */
  setPauseHandlers(onResume: () => void, onRestart: () => void): void {
    document.getElementById('btnResume')!.addEventListener('click', onResume);
    document.getElementById('btnRestart')!.addEventListener('click', onRestart);
  }

  hideOverlay(): void { this.overlay.style.display = 'none'; }

  resetRace(): void {
    this.lastSpeed = -1;
    this.lastRank = 0;
    this.lastCharge = -1;
    this.lastDrift = false;
    this.lastBoosting = false;
    this.posFlashT = 0;
    this.speedBox.classList.remove('boosting');
    this.driftTag.style.display = 'none';
    this.posDelta.style.display = 'none';
    this.speedVal.textContent = '0';
    this.speedFill.style.width = '0%';
  }

  flash(): void {
    const f = document.getElementById('flash')!;
    f.style.transition = 'none';
    f.style.opacity = '0.55';
    requestAnimationFrame(() => {
      f.style.transition = 'opacity .55s ease-out';
      f.style.opacity = '0';
    });
  }
}
