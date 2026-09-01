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
#touchUI #tLeft { left: 26px; bottom: 110px; font-size: 24px; }
#touchUI #tRight { left: 120px; bottom: 110px; font-size: 24px; }
#touchUI #tGas { right: 26px; bottom: 96px; width: 92px; height: 92px; }
#touchUI #tBrake { right: 132px; bottom: 130px; }
#touchUI #tNitro { right: 40px; bottom: 210px; }
`;

export class Input {
  private keys = new Set<string>();
  private queued: string[] = [];
  private padPrev: boolean[] = [];
  private padSteer = 0;
  private rtVal = 0;
  private ltVal = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.queued.push(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    if (this.isTouch()) this.buildTouchUI();
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

  /** On-screen controls for touch devices; inject virtual key presses. */
  private buildTouchUI(): void {
    if (document.getElementById('touchUI')) return;
    const style = document.createElement('style');
    style.textContent = TOUCH_CSS;
    document.head.appendChild(style);

    const ui = document.createElement('div');
    ui.id = 'touchUI';

    const mk = (id: string, label: string, code: string, mag = false): void => {
      const b = document.createElement('div');
      b.className = 'tb' + (mag ? ' mag' : '');
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

    mk('tLeft', '◀', 'KeyA');
    mk('tRight', '▶', 'KeyD');
    mk('tGas', 'GAS', 'KeyW');
    mk('tBrake', 'BRK', 'KeyS');
    mk('tNitro', 'NITRO', 'ShiftLeft', true);

    // any tap doubles as Enter (start / restart) — the game only consumes it
    // in attract/finished phases, so taps while racing are harmless.
    ui.addEventListener('pointerdown', () => this.queued.push('Enter'));
    document.body.appendChild(ui);
  }
}
