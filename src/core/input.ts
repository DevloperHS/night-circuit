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
#touchUI {
  position: fixed; inset: 0; z-index: 30; touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
#touchUI .tb {
  position: absolute; display: flex; align-items: center; justify-content: center;
  width: 64px; height: 64px; border-radius: 50%;
  border: 1px solid rgba(42,245,228,.55);
  background: linear-gradient(160deg, rgba(14,28,38,.55), rgba(5,11,16,.65));
  box-shadow: 0 0 18px rgba(42,245,228,.14), inset 0 0 14px rgba(42,245,228,.08);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  color: #d8f7ff; font: 700 11px/1 'Segoe UI', system-ui, sans-serif; letter-spacing: 2px;
  touch-action: none; user-select: none; -webkit-user-select: none; pointer-events: auto;
  transition: transform .08s ease, box-shadow .15s ease, background .15s ease;
}
#touchUI .tb.arrow { font-size: 30px; font-weight: 400; letter-spacing: 0; }
#touchUI .tb.mag {
  border-color: rgba(255,43,214,.55); color: #ffd9f4;
  box-shadow: 0 0 18px rgba(255,43,214,.16), inset 0 0 14px rgba(255,43,214,.10);
}
#touchUI .tb.pill { width: 118px; height: 48px; border-radius: 999px; }
#touchUI .tb.on {
  background: linear-gradient(160deg, rgba(42,245,228,.38), rgba(42,245,228,.14));
  box-shadow: 0 0 26px rgba(42,245,228,.45), inset 0 0 16px rgba(42,245,228,.25);
  transform: scale(.93);
}
#touchUI .tb.mag.on {
  background: linear-gradient(160deg, rgba(255,43,214,.42), rgba(255,43,214,.14));
  box-shadow: 0 0 26px rgba(255,43,214,.5), inset 0 0 16px rgba(255,43,214,.28);
}
/* Two tidy thumb rows — steer left, brake+gas right, action pills above.
   Geometry fits a 390px-wide phone with clear gaps between the clusters. */
#touchUI #tLeft  { left:  calc(14px + env(safe-area-inset-left));  bottom: calc(24px + env(safe-area-inset-bottom)); width: 80px; height: 80px; }
#touchUI #tRight { left:  calc(100px + env(safe-area-inset-left)); bottom: calc(24px + env(safe-area-inset-bottom)); width: 80px; height: 80px; }
#touchUI #tBrake { right: calc(120px + env(safe-area-inset-right)); bottom: calc(24px + env(safe-area-inset-bottom)); width: 68px; height: 68px; font-size: 24px; }
#touchUI #tGas   { right: calc(14px + env(safe-area-inset-right));  bottom: calc(24px + env(safe-area-inset-bottom)); width: 98px; height: 98px; font-size: 36px; }
#touchUI .tb.pill { width: 112px; height: 46px; }
#touchUI #tDrift { right: calc(134px + env(safe-area-inset-right)); bottom: calc(136px + env(safe-area-inset-bottom)); }
#touchUI #tNitro { right: calc(14px + env(safe-area-inset-right));  bottom: calc(136px + env(safe-area-inset-bottom)); }
/* short landscape screens: shrink and pull the pills in so they clear the compact HUD */
@media (max-height: 500px) {
  #touchUI #tLeft, #touchUI #tRight { width: 68px; height: 68px; }
  #touchUI #tRight { left: calc(88px + env(safe-area-inset-left)); }
  #touchUI #tGas { width: 80px; height: 80px; font-size: 28px; }
  #touchUI #tBrake { right: calc(104px + env(safe-area-inset-right)); width: 60px; height: 60px; font-size: 20px; }
  #touchUI .tb.pill { height: 40px; }
  #touchUI #tDrift, #touchUI #tNitro { bottom: calc(108px + env(safe-area-inset-bottom)); }
  #touchUI #tDrift { right: calc(134px + env(safe-area-inset-right)); }
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

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.queued.push(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    // Auto-detect: touch devices get the on-screen controls + compact HUD;
    // desktop never does. Keyboard + gamepad stay live regardless.
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
   * devices auto-enable it (see constructor); no manual toggle exists.
   * Keyboard + gamepad stay live regardless, so nothing else changes.
   */
  setMobileMode(on: boolean): void {
    if (on === this.mobileMode) return;
    this.mobileMode = on;
    document.body.classList.toggle('mobile-mode', on); // compact HUD hook (index.html)
    if (on) this.buildTouchUI();
    else this.destroyTouchUI();
    const hint = document.getElementById('startHint');
    if (hint) hint.textContent = on ? 'TAP TO START' : 'PRESS ENTER';
  }

  private destroyTouchUI(): void {
    for (const code of VIRTUAL_KEYS) this.keys.delete(code);
    document.getElementById('touchUI')?.remove();
  }

  /** On-screen arrow controls for mobile mode; inject virtual key presses. */
  private buildTouchUI(): void {
    if (document.getElementById('touchUI')) return;
    if (!document.getElementById('mobile-mode-style')) {
      const style = document.createElement('style');
      style.id = 'mobile-mode-style';
      style.textContent = TOUCH_CSS;
      document.head.appendChild(style);
    }
    const ui = document.createElement('div');
    ui.id = 'touchUI';

    const mk = (id: string, label: string, code: string, mag = false, arrow = false, pill = false): HTMLElement => {
      const b = document.createElement('div');
      b.className = 'tb' + (mag ? ' mag' : '') + (arrow ? ' arrow' : '') + (pill ? ' pill' : '');
      b.id = id;
      b.dataset.code = code;
      b.textContent = label;
      ui.appendChild(b);
      return b;
    };

    // arrow keys — left thumb steers, right thumb drives
    mk('tLeft', '◀', 'ArrowLeft', false, true);
    mk('tRight', '▶', 'ArrowRight', false, true);
    mk('tGas', '▲', 'ArrowUp', false, true);
    mk('tBrake', '▼', 'ArrowDown', false, true);
    mk('tDrift', 'DRIFT', 'Space', true, false, true);   // handbrake: charges NITRO
    mk('tNitro', 'NITRO', 'ShiftLeft', true, false, true);

    // Multi-touch + slide-safe input: capture on the container so a thumb can
    // drag between buttons (e.g. ◀ → ▶) without losing the press, and two
    // thumbs (steer + gas) work simultaneously.
    const active = new Map<number, HTMLElement>();
    const btnFrom = (e: PointerEvent): HTMLElement | null => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return (el && el !== ui ? el.closest<HTMLElement>('.tb') : null) ?? null;
    };
    const press = (b: HTMLElement, pointerId: number): void => {
      active.set(pointerId, b);
      b.classList.add('on');
      const code = b.dataset.code!;
      this.keys.add(code);
      this.queued.push(code);
    };
    const release = (b: HTMLElement): void => {
      b.classList.remove('on');
      this.keys.delete(b.dataset.code!);
    };
    ui.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { ui.setPointerCapture(e.pointerId); } catch { /* detached */ }
      const b = btnFrom(e);
      if (b) press(b, e.pointerId);
      // any tap doubles as Enter (start / restart / resume) — the game only
      // consumes it in attract/finished/paused phases, so racing taps are harmless.
      this.queued.push('Enter');
    });
    ui.addEventListener('pointermove', (e) => {
      const cur = active.get(e.pointerId);
      if (!cur) return;
      const b = btnFrom(e);
      if (b && b !== cur) { release(cur); press(b, e.pointerId); }
    });
    const end = (e: PointerEvent): void => {
      const b = active.get(e.pointerId);
      if (b) { release(b); active.delete(e.pointerId); }
    };
    ui.addEventListener('pointerup', end);
    ui.addEventListener('pointercancel', end);
    ui.addEventListener('lostpointercapture', end);
    document.body.appendChild(ui);
  }
}
