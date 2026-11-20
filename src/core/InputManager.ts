export class InputManager {
  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();

  public mouseLeftDown = false;
  public mouseLeftJustPressed = false;
  public mouseLeftJustReleased = false;
  public mouseLeftHoldTime = 0;
  public mouseRightDown = false;
  public mouseRightJustPressed = false;
  public mouseMiddleJustPressed = false;
  public mouseDeltaX = 0;
  public mouseDeltaY = 0;
  public wheelDelta = 0;
  public isLocked = false;
  public altHeld = false;

  // Virtual mobile touch joystick & sprint channels
  public virtualMoveX = 0;
  public virtualMoveY = 0;
  public virtualSprintHeld = false;

  private readonly pointerTarget: HTMLElement;
  private gameplayActive = false;

  // Active canvas touches for mobile camera orbit & pinch-to-zoom
  private readonly canvasTouches = new Map<number, { x: number; y: number }>();
  private lastPinchDist: number | null = null;

  constructor(pointerTarget: HTMLElement) {
    this.pointerTarget = pointerTarget;
    this.bindEvents();
  }

  public setGameplayActive(active: boolean): void {
    this.gameplayActive = active;
    if (!active) {
      this.exitLock();
      this.clearAllHeld();
    }
  }

  public clearAllHeld(): void {
    this.keysDown.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.mouseLeftHoldTime = 0;
    this.altHeld = false;
    this.virtualMoveX = 0;
    this.virtualMoveY = 0;
    this.virtualSprintHeld = false;
    this.canvasTouches.clear();
    this.lastPinchDist = null;
  }

  public injectKeyPress(code: string): void {
    this.keysPressed.add(code);
  }

  public injectAttackDown(): void {
    if (!this.gameplayActive) return;
    this.mouseLeftDown = true;
    this.mouseLeftJustPressed = true;
    this.mouseLeftHoldTime = 0;
  }

  public injectAttackUp(): void {
    if (this.mouseLeftDown) {
      this.mouseLeftDown = false;
      this.mouseLeftJustReleased = true;
    }
  }

  public requestLock(): void {
    if (!this.gameplayActive || this.altHeld) return;
    // Skip pointer lock on touch-only devices
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (document.pointerLockElement === this.pointerTarget) return;
    try {
      const result = this.pointerTarget.requestPointerLock?.() as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {
          // Safe fallback when pointer lock is unavailable
        });
      }
    } catch {
      // Safe fallback
    }
  }

  public exitLock(): void {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore
      }
    }
  }

  public isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  public wasKeyPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  public update(dt: number): void {
    if (this.mouseLeftDown) {
      this.mouseLeftHoldTime += dt;
    }
  }

  public clearFrameDeltas(): void {
    this.keysPressed.clear();
    this.mouseLeftJustPressed = false;
    this.mouseLeftJustReleased = false;
    this.mouseRightJustPressed = false;
    this.mouseMiddleJustPressed = false;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.wheelDelta = 0;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (
        e.code === 'F1' ||
        e.code === 'F3' ||
        e.code === 'AltLeft' ||
        e.code === 'AltRight' ||
        e.code === 'Tab' ||
        e.code === 'Space'
      ) {
        if (this.gameplayActive || e.code === 'F1' || e.code === 'F3' || e.code === 'Tab') {
          e.preventDefault();
        }
      }
      if (!e.repeat) {
        this.keysPressed.add(e.code);
      }
      this.keysDown.add(e.code);

      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        this.altHeld = true;
        this.exitLock();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        this.altHeld = false;
      }
    });

    window.addEventListener('blur', () => {
      this.clearAllHeld();
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.pointerTarget;
    });

    this.pointerTarget.addEventListener('mousedown', (e) => {
      if (!this.gameplayActive) return;
      if (e.target !== this.pointerTarget) return;

      if (e.button === 0) {
        if (!this.isLocked && !this.altHeld) {
          this.requestLock();
        }
        this.mouseLeftDown = true;
        this.mouseLeftJustPressed = true;
        this.mouseLeftHoldTime = 0;
      } else if (e.button === 1) {
        e.preventDefault();
        this.mouseMiddleJustPressed = true;
      } else if (e.button === 2) {
        this.mouseRightDown = true;
        this.mouseRightJustPressed = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.mouseLeftDown) {
        this.mouseLeftDown = false;
        this.mouseLeftJustReleased = true;
      } else if (e.button === 2) {
        this.mouseRightDown = false;
      }
    });

    this.pointerTarget.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.gameplayActive) return;
      if (this.isLocked) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      } else if (this.mouseRightDown && !this.altHeld) {
        this.mouseDeltaX += e.movementX * 1.25;
        this.mouseDeltaY += e.movementY * 1.25;
      }
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.gameplayActive) return;
        this.wheelDelta += e.deltaY;
      },
      { passive: true },
    );

    // Touch Camera Orbit & Two-Finger Pinch Zoom directly on the 3D Canvas
    this.pointerTarget.addEventListener(
      'touchstart',
      (e) => {
        if (!this.gameplayActive) return;
        if (e.target !== this.pointerTarget) return;
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          this.canvasTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
        if (this.canvasTouches.size === 2) {
          const pts = Array.from(this.canvasTouches.values());
          this.lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        }
      },
      { passive: false },
    );

    this.pointerTarget.addEventListener(
      'touchmove',
      (e) => {
        if (!this.gameplayActive) return;
        if (this.canvasTouches.size === 0) return;
        e.preventDefault();

        if (this.canvasTouches.size === 1) {
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const prev = this.canvasTouches.get(t.identifier);
            if (prev) {
              const dx = t.clientX - prev.x;
              const dy = t.clientY - prev.y;
              this.mouseDeltaX += dx * 1.75;
              this.mouseDeltaY += dy * 1.55;
              prev.x = t.clientX;
              prev.y = t.clientY;
            }
          }
        } else {
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const prev = this.canvasTouches.get(t.identifier);
            if (prev) {
              prev.x = t.clientX;
              prev.y = t.clientY;
            }
          }
          if (this.canvasTouches.size === 2) {
            const pts = Array.from(this.canvasTouches.values());
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            if (this.lastPinchDist !== null) {
              this.wheelDelta += (this.lastPinchDist - dist) * 4.5;
            }
            this.lastPinchDist = dist;
          }
        }
      },
      { passive: false },
    );

    const endCanvasTouches = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        this.canvasTouches.delete(e.changedTouches[i].identifier);
      }
      if (this.canvasTouches.size < 2) {
        this.lastPinchDist = null;
      }
    };

    this.pointerTarget.addEventListener('touchend', endCanvasTouches, { passive: true });
    this.pointerTarget.addEventListener('touchcancel', endCanvasTouches, { passive: true });
  }
}
