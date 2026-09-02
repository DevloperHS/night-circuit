/** Gamepad button index → virtual key code (edge-triggered). */
const PAD_BUTTONS: Record<number, string> = {
  0: 'KeyW',      // A — throttle
  1: 'Space',     // B — handbrake
  2: 'ShiftLeft', // X — nitro
  3: 'KeyR',      // Y — restart
  9: 'Enter',     // Start — begin / confirm
  8: 'Escape',   // Select/Share — pause
  12: 'KeyW', 13: 'KeyS', 14: 'KeyA', 15: 'KeyD', // d-pad
};

const RT = 7; // right trigger (analog throttle)
const LT = 6; // left trigger (analog brake)

const TOUCH_CSS = `
#touchUI { position: fixed; inset: 0; z-index: 30; touch-action: none; }
#touchUI .tb {
  position: absolute; width: 74px; height: 74px; border-radius: 50%;
  border: 1px solid rgba(42,245,228,.45); background: rgba(8,16,22,.35);
  color: #bfefff; font: 700 11px/1 'Segoe UI', system-ui, sans-serif;
  letter-spacing: 1px; display: flex; align-items: center; justify-content: center;
  touch-action: none; user-select: none; -webkit-user-select: none; pointer-events: auto;
}
#touchUI .tb.mag { border-color: rgba(255,43,214,.5); color: #ffd9f4; }
#touchUI .tb.on { background: rgba(42,245,228,.22); }
#touchUI .tb.mag.on { background: rgba(255,43,214,.25); }
#touchUI .tb.arrow { font-size: 30px; font-weight: 400; letter-spacing: 0; }
#touchUI #tLeft { left: 22px; bottom: 104px; width: 84px; height: 84px; }
#touchUI #tRight { left: 128px; bottom: 104px; width: 84px; height: 84px; }
#touchUI #tGas { right: 22px; bottom: 88px; width: 96px; height: 96px; font-size: 34px; font-weight: 400; }
#touchUI #tBrake { right: 122px; bottom: 158px; width: 70px; height: 70px; font-size: 24px; font-weight: 400; }
#touchUI #tNitro { right: 34px; bottom: 206px; }
#touchUI #tDrift { left: 26px; bottom: 214px; }

/* desktop-reachable toggle chip for mobile mode */
#mobChip {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 35;
  padding: 7px 14px; border-radius: 999px; cursor: pointer;
  border: 1px solid rgba(42,245,228,.30); background: rgba(8,16,22,.55);
  color: #7fb9c9; font: 700 10px/1 'Segoe UI', system-ui, sans-serif; letter-spacing: 2px;
  pointer-events: auto; user-select: none; -webkit-user-select: none; touch-action: manipulation;
}
#mobChip.on {
  color: #bfefff; border-color: rgba(42,245,228,.85);
  background: rgba(42,245,228,.12); box-shadow: 0 0 16px rgba(42,245,228,.25);
}
`;

/** Virtual keys the on-screen buttons hold — released wholesale when mobile mode turns off. */
const VIRTUAL_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft'];

export class Input {
  private keys = new Set<string>();
  private queued: string[] = [];
  private padPrev: boolean[] = [];
  private padSteer = 0;
  private rtVal = 0;
  private ltVal = 0;
  private mobileMode = false;
  private chip: HTMLElement | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.queued.push(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.buildChip();
    if (this.isTouch()) this.setMobileMode(true);
  }

  down(code: string): boolean { return this.keys.has(code); }

  /** One-shot press, consumed once. */
  pressed(code: string): boolean {
    const i = this.queued.indexOf(code);
    if (i >= 0) { this.queued.splice(i, 1); return true; }
    return false;
  }

  endFrame(): void { this.queued.length = 0; }

  /** Per-frame gamepad poll — call once before reading the getters. */
  poll(): void {
    this.padSteer = 0;
    this.rtVal = 0;
    this.ltVal = 0;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) { pad = p; break; }
    }
    if (!pad) {
      // pad unplugged: release any held virtual keys
      if (this.padPrev.length) {
        for (let i = 0; i < this.padPrev.length; i++) {
          if (this.padPrev[i]) {
            const code = PAD_BUTTONS[i];
            if (code) this.keys.delete(code);
          }
        }
        this.padPrev.length = 0;
      }
      return;
    }

    // edge-triggered buttons → virtual keys
    const btns = pad.buttons;
    for (let i = 0; i < btns.length; i++) {
      const code = PAD_BUTTONS[i];
      if (!code) continue;
      const down = btns[i].pressed;
      const was = this.padPrev[i] === true;
      if (down && !was) {
        this.keys.add(code);
        this.queued.push(code);
      } else if (!down && was) {
        this.keys.delete(code);
      }
      this.padPrev[i] = down;
    }

    // analog triggers
    this.rtVal = btns[RT]?.value ?? 0;
    this.ltVal = btns[LT]?.value ?? 0;

    // left stick → analog steer (with deadzone)
    const ax = pad.axes[0] ?? 0;
    const dz = 0.14;
    this.padSteer = Math.abs(ax) > dz
      ? Math.sign(ax) * Math.min(1, (Math.abs(ax) - dz) / (1 - dz))
      : 0;
  }

  get throttle(): number {
    const key = (this.down('KeyW') || this.down('ArrowUp')) ? 1 : 0;
    return Math.max(key, this.rtVal);
  }
  get brake(): number {
    const key = (this.down('KeyS') || this.down('ArrowDown')) ? 1 : 0;
    return Math.max(key, this.ltVal);
  }
  get steer(): number {
    const k = ((this.down('KeyD') || this.down('ArrowRight')) ? 1 : 0) -
      ((this.down('KeyA') || this.down('ArrowLeft')) ? 1 : 0);
    return k !== 0 ? k : this.padSteer;
  }
  get handbrake(): boolean { return this.down('Space'); }
  get boostKey(): boolean { return this.down('ShiftLeft') || this.down('ShiftRight'); }

  private isTouch(): boolean {
    const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
    return coarse || 'ontouchstart' in window;
  }

  /**
   * Mobile mode on/off: shows/hides the on-screen arrow controls. Touch
   * devices auto-enable it; anywhere else the 📱 MOBILE chip toggles it.
   * Keyboard + gamepad stay live regardless, so nothing else changes.
   */
  setMobileMode(on: boolean): void {
    if (on === this.mobileMode) return;
    this.mobileMode = on;
    document.body.classList.toggle('mobile-mode', on); // compact HUD hook (index.html)
    if (on) this.buildTouchUI();
    else this.destroyTouchUI();
    this.chip?.classList.toggle('on', on);
    const hint = document.getElementById('startHint');
    if (hint) hint.textContent = on ? 'TAP TO START' : 'PRESS ENTER';
  }

  private destroyTouchUI(): void {
    for (const code of VIRTUAL_KEYS) this.keys.delete(code);
    document.getElementById('touchUI')?.remove();
  }

  /** Small toggle chip (top-center) so mobile mode works on any device. */
  private buildChip(): void {
    if (this.chip || document.getElementById('mobChip')) return;
    if (!document.getElementById('mobile-mode-style')) {
      const style = document.createElement('style');
      style.id = 'mobile-mode-style';
      style.textContent = TOUCH_CSS;
      document.head.appendChild(style);
    }
    const chip = document.createElement('div');
    chip.id = 'mobChip';
    chip.textContent = '📱 MOBILE';
    chip.addEventListener('click', () => this.setMobileMode(!this.mobileMode));
    document.body.appendChild(chip);
    this.chip = chip;
  }

  /** On-screen arrow controls for mobile mode; inject virtual key presses. */
  private buildTouchUI(): void {
    if (document.getElementById('touchUI')) return;
    const ui = document.createElement('div');
    ui.id = 'touchUI';

    const mk = (id: string, label: string, code: string, mag = false, arrow = false): void => {
      const b = document.createElement('div');
      b.className = 'tb' + (mag ? ' mag' : '') + (arrow ? ' arrow' : '');
      b.id = id;
      b.textContent = label;
      const on = (e: PointerEvent) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch { /* detached */ }
        b.classList.add('on');
        this.keys.add(code);
        this.queued.push(code);
      };
      const off = () => { b.classList.remove('on'); this.keys.delete(code); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
      ui.appendChild(b);
    };

    // arrow keys — left thumb steers, right thumb drives
    mk('tLeft', '◀', 'ArrowLeft', false, true);
    mk('tRight', '▶', 'ArrowRight', false, true);
    mk('tGas', '▲', 'ArrowUp', false, true);
    mk('tBrake', '▼', 'ArrowDown', false, true);
    mk('tDrift', 'DRIFT', 'Space', true);   // handbrake: charges NITRO
    mk('tNitro', 'NITRO', 'ShiftLeft', true);

    // any tap doubles as Enter (start / restart / resume) — the game only
    // consumes it in attract/finished/paused phases, so racing taps are harmless.
    ui.addEventListener('pointerdown', () => this.queued.push('Enter'));
    document.body.appendChild(ui);
  }
}
