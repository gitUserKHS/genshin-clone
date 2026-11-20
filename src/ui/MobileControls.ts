import type { InputManager } from '../core/InputManager';

export function detectTouchDevice(): boolean {
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(max-width: 900px)').matches ||
    navigator.maxTouchPoints > 0
  );
}

export class MobileControls {
  public readonly el: HTMLElement;
  private enabled = false;
  private visible = false;

  private readonly joyBase: HTMLElement;
  private readonly joyThumb: HTMLElement;
  private joyPointerId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private readonly maxRadius = 52;

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
    onTriggerSight: () => void,
    onQuickHeal: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'mobile-controls hidden';
    this.el.innerHTML = `
      <div class="mobile-joy-zone">
        <div class="mobile-joy-base">
          <div class="mobile-joy-thumb"></div>
        </div>
      </div>

      <div class="mobile-utility-row">
        <button class="m-util-btn m-sight-btn" type="button" title="원소 시야">👁</button>
        <button class="m-util-btn m-heal-btn" type="button" title="스튜 회복">🍖</button>
      </div>

      <div class="mobile-action-pad">
        <button class="m-act-btn m-jump-btn" type="button" title="점프 / 활강">↑<span>점프</span></button>
        <button class="m-act-btn m-dash-btn" type="button" title="대시 / 질주">⚡<span>대시</span></button>
        <button class="m-act-btn m-atk-btn" type="button" title="공격 / 홀드 강공격">⚔</button>
      </div>
    `;

    parent.appendChild(this.el);

    this.joyBase = this.el.querySelector('.mobile-joy-base')!;
    this.joyThumb = this.el.querySelector('.mobile-joy-thumb')!;

    this.bindJoystick(this.el.querySelector('.mobile-joy-zone')!);
    this.bindButtons(onTriggerSight, onQuickHeal);

    this.setEnabled(detectTouchDevice());
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    document.body.classList.toggle('mobile-controls-on', enabled);
    this.syncVisibility();
    if (!enabled) {
      this.resetJoystick();
      this.input.virtualSprintHeld = false;
    }
  }

  public setGameplayVisible(visible: boolean): void {
    this.visible = visible;
    this.syncVisibility();
    if (!visible) {
      this.resetJoystick();
      this.input.virtualSprintHeld = false;
    }
  }

  private syncVisibility(): void {
    const show = this.enabled && this.visible;
    this.el.classList.toggle('hidden', !show);
  }

  private resetJoystick(): void {
    this.joyPointerId = null;
    this.input.virtualMoveX = 0;
    this.input.virtualMoveY = 0;
    this.joyThumb.style.transform = 'translate(-50%, -50%)';
    this.joyBase.classList.remove('active');
  }

  private bindJoystick(zone: HTMLElement): void {
    zone.addEventListener('pointerdown', (e) => {
      if (this.joyPointerId !== null) return;
      e.preventDefault();
      e.stopPropagation();
      this.joyPointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);

      const rect = this.joyBase.getBoundingClientRect();
      this.joyOriginX = rect.left + rect.width / 2;
      this.joyOriginY = rect.top + rect.height / 2;
      this.joyBase.classList.add('active');
      this.updateStick(e.clientX, e.clientY);
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyPointerId) return;
      e.preventDefault();
      e.stopPropagation();
      this.updateStick(e.clientX, e.clientY);
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.joyPointerId) return;
      e.preventDefault();
      e.stopPropagation();
      this.resetJoystick();
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  private updateStick(clientX: number, clientY: number): void {
    let dx = clientX - this.joyOriginX;
    let dy = clientY - this.joyOriginY;
    const dist = Math.hypot(dx, dy);
    if (dist > this.maxRadius) {
      dx = (dx / dist) * this.maxRadius;
      dy = (dy / dist) * this.maxRadius;
    }

    this.joyThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // Screen X -> +right, Screen Y up (negative dy) -> +forward
    const nx = dx / this.maxRadius;
    const ny = -dy / this.maxRadius;
    this.input.virtualMoveX = Math.abs(nx) < 0.08 ? 0 : nx;
    this.input.virtualMoveY = Math.abs(ny) < 0.08 ? 0 : ny;
  }

  private bindButtons(onTriggerSight: () => void, onQuickHeal: () => void): void {
    const atkBtn = this.el.querySelector('.m-atk-btn') as HTMLButtonElement;
    atkBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      atkBtn.setPointerCapture(e.pointerId);
      atkBtn.classList.add('pressed');
      this.input.injectAttackDown();
    });
    const endAtk = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      atkBtn.classList.remove('pressed');
      this.input.injectAttackUp();
    };
    atkBtn.addEventListener('pointerup', endAtk);
    atkBtn.addEventListener('pointercancel', endAtk);

    const jumpBtn = this.el.querySelector('.m-jump-btn') as HTMLButtonElement;
    jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpBtn.classList.add('pressed');
      this.input.injectKeyPress('Space');
    });
    const endJump = () => jumpBtn.classList.remove('pressed');
    jumpBtn.addEventListener('pointerup', endJump);
    jumpBtn.addEventListener('pointercancel', endJump);

    const dashBtn = this.el.querySelector('.m-dash-btn') as HTMLButtonElement;
    dashBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dashBtn.setPointerCapture(e.pointerId);
      dashBtn.classList.add('pressed');
      this.input.injectKeyPress('ShiftLeft');
      this.input.virtualSprintHeld = true;
    });
    const endDash = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dashBtn.classList.remove('pressed');
      this.input.virtualSprintHeld = false;
    };
    dashBtn.addEventListener('pointerup', endDash);
    dashBtn.addEventListener('pointercancel', endDash);

    const sightBtn = this.el.querySelector('.m-sight-btn') as HTMLButtonElement;
    sightBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onTriggerSight();
    });

    const healBtn = this.el.querySelector('.m-heal-btn') as HTMLButtonElement;
    healBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onQuickHeal();
    });
  }
}
