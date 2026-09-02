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
/* Joystick + action circles — translucent glass, racing-game style.
   Left thumb: joystick (X steers analog, push up = gas, pull down = brake).
   Right thumb: circular BOOST / BRAKE / DRIFT. Fits a 390px phone. */
#touchUI #joy {
  position: absolute; left: calc(18px + env(safe-area-inset-left)); bottom: calc(26px + env(safe-area-inset-bottom));
  width: 124px; height: 124px; border-radius: 50%;
  border: 1.5px solid rgba(235,248,255,.30);
  background: radial-gradient(circle at 50% 38%, rgba(220,240,255,.16), rgba(10,18,26,.22));
  box-shadow: 0 0 24px rgba(170,225,255,.12), inset 0 0 20px rgba(220,240,255,.10);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  touch-action: none; user-select: none; -webkit-user-select: none; pointer-events: auto;
}
#touchUI #joyKnob {
  position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; border-radius: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle at 50% 32%, rgba(242,250,255,.42), rgba(150,195,225,.18));
  border: 1.5px solid rgba(242,250,255,.45);
  box-shadow: 0 0 16px rgba(220,240,255,.30);
  will-change: transform;
}
#touchUI #bNitro { right: calc(16px + env(safe-area-inset-right)); bottom: calc(128px + env(safe-area-inset-bottom)); width: 82px; height: 82px; font-size: 12px; }
#touchUI #bBrake { right: calc(20px + env(safe-area-inset-right)); bottom: calc(26px + env(safe-area-inset-bottom)); width: 72px; height: 72px; font-size: 11px; }
#touchUI #bDrift { right: calc(112px + env(safe-area-inset-right)); bottom: calc(58px + env(safe-area-inset-bottom)); width: 66px; height: 66px; font-size: 11px; }
/* short landscape screens: shrink everything so it clears the compact HUD */
@media (max-height: 500px) {
  #touchUI #joy { width: 84px; height: 84px; left: calc(12px + env(safe-area-inset-left)); bottom: calc(12px + env(safe-area-inset-bottom)); }
  #touchUI #joyKnob { width: 40px; height: 40px; }
  #touchUI #bNitro { width: 64px; height: 64px; right: calc(14px + env(safe-area-inset-right)); bottom: calc(78px + env(safe-area-inset-bottom)); font-size: 10px; }
  #touchUI #bBrake { width: 56px; height: 56px; right: calc(14px + env(safe-area-inset-right)); bottom: calc(16px + env(safe-area-inset-bottom)); }
  #touchUI #bDrift { width: 52px; height: 52px; right: calc(92px + env(safe-area-inset-right)); bottom: calc(38px + env(safe-area-inset-bottom)); }
}
`;

/** Virtual keys the on-screen buttons hold — released wholesale when mobile mode turns off. */
const VIRTUAL_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft'];

export class Input {
  private keys = new Set<string>();
  private queued: string[] = [];
  private padPrev: boolean[] = [];
  private padSteer = 0;
  private touchSteer = 0;
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
    if (k !== 0) return k;
    if (this.padSteer !== 0) return this.padSteer;
    return this.touchSteer;
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
    this.touchSteer = 0;
    document.getElementById('touchUI')?.remove();
  }

  /** On-screen joystick + action circles for mobile mode; inject virtual key presses. */
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

    const mk = (id: string, label: string, code: string, mag = false): HTMLElement => {
      const b = document.createElement('div');
      b.className = 'tb' + (mag ? ' mag' : '');
      b.id = id;
      b.dataset.code = code;
      b.textContent = label;
      ui.appendChild(b);
      return b;
    };

    // action circles — right thumb (drift = handbrake: charges NITRO)
    mk('bNitro', 'NITRO', 'ShiftLeft', true);
    mk('bBrake', 'BRAKE', 'ArrowDown', false);
    mk('bDrift', 'DRIFT', 'Space', true);

    // virtual joystick — left thumb: X steers (analog), up = gas, down = brake
    const joy = document.createElement('div');
    joy.id = 'joy';
    const knob = document.createElement('div');
    knob.id = 'joyKnob';
    joy.appendChild(knob);
    ui.appendChild(joy);

    // Multi-touch: per-pointer routing — one pointer drives the joystick
    // (analog steer + gas/brake keys), others press/slide the circles.
    // Capture on the container so drags never lose the pointer.
    const active = new Map<number, HTMLElement>();
    let joyId: number | null = null;
    let joyRect: DOMRect | null = null;
    const joyKeys = new Set<string>();
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
    const joyKey = (code: string, on: boolean): void => {
      const had = joyKeys.has(code);
      if (on && !had) { joyKeys.add(code); this.keys.add(code); this.queued.push(code); }
      else if (!on && had) { joyKeys.delete(code); this.keys.delete(code); }
    };
    const applyJoy = (e: PointerEvent): void => {
      if (!joyRect) return;
      const max = joyRect.width * 0.30;
      let dx = e.clientX - (joyRect.x + joyRect.width / 2);
      let dy = e.clientY - (joyRect.y + joyRect.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
      knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
      const dz = 0.24;
      const nx = dx / max, ny = dy / max;
      this.touchSteer = Math.abs(nx) > dz
        ? Math.sign(nx) * Math.min(1, (Math.abs(nx) - dz) / (1 - dz))
        : 0;
      joyKey('ArrowUp', ny < -0.38);
      joyKey('ArrowDown', ny > 0.38);
    };
    const resetJoy = (): void => {
      knob.style.transform = 'translate(-50%, -50%)';
      this.touchSteer = 0;
      for (const code of joyKeys) this.keys.delete(code);
      joyKeys.clear();
    };
    ui.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { ui.setPointerCapture(e.pointerId); } catch { /* detached */ }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el.closest('#joy') && joyId === null) {
        joyId = e.pointerId;
        joyRect = joy.getBoundingClientRect();
        applyJoy(e);
      } else {
        const b = btnFrom(e);
        if (b) press(b, e.pointerId);
      }
      // any tap doubles as Enter (start / restart / resume) — the game only
      // consumes it in attract/finished/paused phases, so racing taps are harmless.
      this.queued.push('Enter');
    });
    ui.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyId) { applyJoy(e); return; }
      const cur = active.get(e.pointerId);
      if (!cur) return;
      const b = btnFrom(e);
      if (b && b !== cur) { release(cur); press(b, e.pointerId); }
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === joyId) { joyId = null; joyRect = null; resetJoy(); return; }
      const b = active.get(e.pointerId);
      if (b) { release(b); active.delete(e.pointerId); }
    };
    ui.addEventListener('pointerup', end);
    ui.addEventListener('pointercancel', end);
    ui.addEventListener('lostpointercapture', end);
    document.body.appendChild(ui);
  }
}
