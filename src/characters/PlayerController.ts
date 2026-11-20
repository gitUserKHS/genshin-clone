import * as THREE from 'three';
import type { SoundEngine } from '../audio/SoundEngine';
import type { InputManager } from '../core/InputManager';
import type { AlternateSprintType, BoxCollider, CollisionWorld, CylinderCollider, UpdraftVolume } from '../core/Types';
import {
  getSurfaceType,
  getTerrainHeight,
  getTerrainNormal,
  getWaterSurfaceY,
  WORLD_HALF,
} from '../world/Terrain';
import type { AnimState, CharacterRig } from './CharacterRig';

export class PlayerController {
  public readonly position = new THREE.Vector3(0, 6, 28);
  public readonly velocity = new THREE.Vector3();
  public facingAngle = Math.PI;

  public cameraYaw = 0;
  public cameraPitch = 0.24;
  public cameraDistance = 6.2;

  public stamina = 240;
  public maxStamina = 240;
  private staminaRegenDelay = 0;

  public grounded = false;
  public gliding = false;
  public climbing = false;
  public swimming = false;
  public sprinting = false;
  public altSprintActive: AlternateSprintType = 'none';
  public plunging = false;
  public dashTimer = 0;
  public iframeTimer = 0;
  public actionLockTimer = 0;

  private burstCamTimer = 0;
  private shakeTimer = 0;
  private shakeStrength = 0;
  private footstepTimer = 0;
  private swimRippleTimer = 0;
  private highestAirY = 0;
  private climbNormal = new THREE.Vector3(0, 0, 1);
  public readonly lastDryPos = new THREE.Vector3(0, 6, 28);

  public activeRig: CharacterRig | null = null;
  public animStateOverride: AnimState | null = null;
  public animOverrideTimer = 0;

  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpNormal = new THREE.Vector3();
  private readonly camLookTarget = new THREE.Vector3();

  public onFallDamage?: (dmg: number) => void;
  public onPlungeLand?: (pos: THREE.Vector3) => void;
  public onAltSprintExit?: (mode: AlternateSprintType, pos: THREE.Vector3) => void;
  public onWaterRipple?: (x: number, y: number, z: number, fast: boolean) => void;
  public onDrown?: () => void;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly sound: SoundEngine) {
    this.position.y = getTerrainHeight(this.position.x, this.position.z);
    this.highestAirY = this.position.y;
    this.lastDryPos.copy(this.position);
  }

  public teleport(x: number, z: number, yOffset = 0.5): void {
    const ground = getTerrainHeight(x, z);
    const waterY = getWaterSurfaceY(x, z);
    this.position.set(x, Math.max(ground, waterY) + yOffset, z);
    this.velocity.set(0, 0, 0);
    this.gliding = false;
    this.climbing = false;
    this.swimming = false;
    this.plunging = false;
    this.altSprintActive = 'none';
    this.activeRig?.setAltSprintVisual('none');
    this.highestAirY = this.position.y;
  }

  public triggerBurstCamera(duration = 0.9): void {
    this.burstCamTimer = duration;
  }

  public triggerCameraShake(strength = 0.25, duration = 0.22): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  public getForwardDirection(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.facingAngle), 0, Math.cos(this.facingAngle)).normalize();
  }

  public update(
    dt: number,
    input: InputManager,
    collisionWorld: CollisionWorld,
    updrafts: UpdraftVolume[],
  ): void {
    if (this.iframeTimer > 0) this.iframeTimer -= dt;
    if (this.actionLockTimer > 0) this.actionLockTimer -= dt;
    if (this.dashTimer > 0) this.dashTimer -= dt;
    if (this.animOverrideTimer > 0) {
      this.animOverrideTimer -= dt;
      if (this.animOverrideTimer <= 0) this.animStateOverride = null;
    }

    // Camera orbit & zoom
    const sens = 0.0024;
    this.cameraYaw -= input.mouseDeltaX * sens;
    this.cameraPitch = Math.max(-0.42, Math.min(1.18, this.cameraPitch + input.mouseDeltaY * sens));
    if (input.wheelDelta !== 0) {
      this.cameraDistance = Math.max(3.2, Math.min(11.5, this.cameraDistance + input.wheelDelta * 0.004));
    }

    const keyZ =
      (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp') ? 1 : 0) -
      (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown') ? 1 : 0);
    const keyX =
      (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight') ? 1 : 0) -
      (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft') ? 1 : 0);
    const moveZ = Math.max(-1, Math.min(1, keyZ + input.virtualMoveY));
    const moveX = Math.max(-1, Math.min(1, keyX + input.virtualMoveX));

    // Camera forward on XZ plane & right = forward × up = (-fz, 0, fx)
    this.tmpForward.set(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw)).normalize();
    this.tmpRight.set(-this.tmpForward.z, 0, this.tmpForward.x).normalize();

    const moveDir = new THREE.Vector3()
      .addScaledVector(this.tmpForward, moveZ)
      .addScaledVector(this.tmpRight, moveX);
    const hasMove = moveDir.lengthSq() > 0.015;
    if (hasMove) moveDir.normalize();

    const rigAltSprint: AlternateSprintType = this.activeRig?.def.altSprint ?? 'none';
    const sprintHeld = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight') || input.virtualSprintHeld;

    // Dash trigger
    const dashPressed =
      (input.wasKeyPressed('ShiftLeft') || input.wasKeyPressed('ShiftRight') || input.mouseRightJustPressed) &&
      !this.climbing &&
      !this.plunging &&
      this.stamina >= 16;

    if (dashPressed && this.dashTimer <= 0) {
      this.dashTimer = 0.28;
      this.iframeTimer = 0.36;
      this.stamina = Math.max(0, this.stamina - 16);
      this.staminaRegenDelay = 0.85;
      if (hasMove) {
        this.facingAngle = Math.atan2(moveDir.x, moveDir.z);
      }
      const dir = this.getForwardDirection();
      const dashSpd = this.swimming ? 10.5 : 16.8;
      this.velocity.x = dir.x * dashSpd;
      this.velocity.z = dir.z * dashSpd;
      this.sound.playDash();
    }

    this.sprinting = sprintHeld && hasMove && this.stamina > 2 && !this.gliding && !this.climbing;

    const surfaceY = getWaterSurfaceY(this.position.x, this.position.z);
    const groundY = getTerrainHeight(this.position.x, this.position.z);
    const basinDepth = surfaceY - groundY;

    // Remember last safe dry ground spot for drowning recovery
    if (this.grounded && basinDepth < 0.2) {
      this.lastDryPos.copy(this.position);
    }

    // Alternate Sprint (Mona Illusory Torrent / Ayaka Frost Dash — skates right over water!)
    const prevAlt = this.altSprintActive;
    const canAltSprint =
      rigAltSprint !== 'none' &&
      this.sprinting &&
      (this.grounded || this.swimming || this.position.y <= surfaceY + 0.35);
    this.altSprintActive = canAltSprint ? rigAltSprint : 'none';
    this.activeRig?.setAltSprintVisual(this.altSprintActive);
    if (prevAlt !== 'none' && this.altSprintActive === 'none') {
      this.onAltSprintExit?.(prevAlt, this.position.clone());
    }

    // Swimming state entry & exit with clean hysteresis (works in Starfell Lake, Ocean, AND Statue Pool!)
    if (this.altSprintActive !== 'none' || this.climbing) {
      this.swimming = false;
    } else if (!this.swimming) {
      if (basinDepth > 0.92 && this.position.y <= surfaceY - 0.65) {
        this.swimming = true;
        this.grounded = false;
        this.gliding = false;
        this.plunging = false;
        this.sound.playFootstep('water');
        this.onWaterRipple?.(this.position.x, surfaceY + 0.05, this.position.z, true);
      }
    } else {
      // Remain swimming until reaching shallow water near shore
      if (basinDepth < 0.8) {
        this.swimming = false;
        this.position.y = Math.max(this.position.y, groundY);
        this.grounded = true;
      }
    }

    if (this.swimming) {
      this.grounded = false;
      this.gliding = false;
      this.plunging = false;
      const fastSwim = this.sprinting && this.stamina > 2;
      const speed = fastSwim ? 6.8 : 4.2;

      if (hasMove && this.actionLockTimer <= 0) {
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveDir.x * speed, dt * 10);
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveDir.z * speed, dt * 10);
        this.facingAngle = this.lerpAngle(this.facingAngle, Math.atan2(moveDir.x, moveDir.z), dt * 10);
        this.consumeStamina((fastSwim ? 16 : 6.2) * dt);
      } else {
        this.velocity.x *= Math.exp(-7 * dt);
        this.velocity.z *= Math.exp(-7 * dt);
      }
      this.velocity.y = 0;

      // Apply horizontal swim movement!
      this.position.addScaledVector(this.velocity, dt);

      // Re-sample water & floor at new swimming position
      const nextSurfaceY = getWaterSurfaceY(this.position.x, this.position.z);
      const nextGroundY = getTerrainHeight(this.position.x, this.position.z);
      const nextDepth = nextSurfaceY - nextGroundY;

      // Keep character's head & shoulders floating naturally at water line
      const targetSwimY = Math.max(nextGroundY, nextSurfaceY - 0.9);
      this.position.y = THREE.MathUtils.lerp(this.position.y, targetSwimY, dt * 10);

      // Periodic water ripples & splash audio
      this.swimRippleTimer -= dt * (fastSwim ? 2.2 : hasMove ? 1.4 : 0.65);
      if (this.swimRippleTimer <= 0) {
        this.swimRippleTimer = 0.45;
        this.onWaterRipple?.(this.position.x, nextSurfaceY + 0.05, this.position.z, fastSwim);
        if (hasMove) this.sound.playFootstep('water');
      }

      // Smoothly step out onto shore or hop out with Space when near bank
      if (nextDepth < 0.82) {
        this.swimming = false;
        this.position.y = nextGroundY;
        this.grounded = true;
      } else if (input.wasKeyPressed('Space') && nextDepth < 1.35) {
        this.swimming = false;
        this.velocity.y = 7.6;
        this.position.y = nextSurfaceY - 0.3;
      } else if (this.stamina <= 0.1) {
        // Out of stamina in deep water -> return safely to last dry shore!
        this.swimming = false;
        this.onDrown?.();
      }
    } else if (this.climbing) {
      this.gliding = false;
      const climbSpeed = 4.6;
      // Player faces -climbNormal, so screen right = (-climbNormal) × up = (climbNormal.z, 0, -climbNormal.x)
      const tangentRight = new THREE.Vector3(this.climbNormal.z, 0, -this.climbNormal.x).normalize();
      this.velocity.set(0, moveZ * climbSpeed, 0);
      this.velocity.addScaledVector(tangentRight, moveX * climbSpeed * 0.75);
      if (hasMove) this.consumeStamina(11 * dt);
      if (input.wasKeyPressed('Space') && this.stamina > 20) {
        this.velocity.y = 9.0;
        this.consumeStamina(20);
      }
      if (input.wasKeyPressed('ControlLeft') || input.wasKeyPressed('KeyX') || this.stamina <= 0.5) {
        this.climbing = false;
        this.velocity.addScaledVector(this.climbNormal, 3.2);
      }
      this.position.addScaledVector(this.velocity, dt);
      const newNormal = getTerrainNormal(this.position.x, this.position.z, this.tmpNormal);
      const newGround = getTerrainHeight(this.position.x, this.position.z);
      if (newNormal.y > 0.65 || this.position.y <= newGround + 0.15) {
        // Smooth mantle over ledge!
        this.climbing = false;
        this.position.y = Math.max(this.position.y, newGround + 0.05);
        this.velocity.y = 2.0;
      } else {
        this.climbNormal.copy(newNormal);
        this.facingAngle = Math.atan2(-newNormal.x, -newNormal.z);
        this.position.y = Math.max(this.position.y, newGround + 0.1);
      }
    } else {
      if (this.grounded) {
        this.gliding = false;
        if (this.plunging) {
          this.plunging = false;
          this.onPlungeLand?.(this.position.clone());
        }
        if (input.wasKeyPressed('Space') && this.actionLockTimer <= 0) {
          this.velocity.y = 9.6;
          this.grounded = false;
          this.highestAirY = this.position.y;
        }
      } else if (input.wasKeyPressed('Space') && !this.plunging) {
        if (!this.gliding && this.stamina > 5) {
          this.gliding = true;
          this.velocity.y = Math.max(this.velocity.y, -1.2);
          this.sound.playGliderOpen();
        } else {
          this.gliding = false;
        }
      }

      // Horizontal velocity
      if (this.dashTimer <= 0 && !this.plunging) {
        const targetSpeed =
          this.altSprintActive !== 'none'
            ? 13.4
            : this.gliding
              ? 9.6
              : this.sprinting
                ? 10.8
                : 6.6;
        if (hasMove && this.actionLockTimer <= 0) {
          this.velocity.x = THREE.MathUtils.lerp(
            this.velocity.x,
            moveDir.x * targetSpeed,
            dt * (this.grounded ? 15 : 6.5),
          );
          this.velocity.z = THREE.MathUtils.lerp(
            this.velocity.z,
            moveDir.z * targetSpeed,
            dt * (this.grounded ? 15 : 6.5),
          );
          this.facingAngle = this.lerpAngle(this.facingAngle, Math.atan2(moveDir.x, moveDir.z), dt * 14);
        } else {
          const damp = this.grounded ? 15 : 2.5;
          this.velocity.x *= Math.exp(-damp * dt);
          this.velocity.z *= Math.exp(-damp * dt);
        }
      }

      if (this.sprinting) this.consumeStamina((this.altSprintActive !== 'none' ? 14 : 15) * dt);
      if (this.gliding) {
        this.consumeStamina(5.2 * dt);
        if (this.stamina <= 0.5) this.gliding = false;
      }

      if (this.plunging) {
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;
        this.velocity.y = -28;
      } else if (this.gliding) {
        let inUpdraft = false;
        for (const u of updrafts) {
          const dist = Math.hypot(this.position.x - u.x, this.position.z - u.z);
          if (dist < u.radius && this.position.y >= u.baseY && this.position.y <= u.topY) {
            inUpdraft = true;
            break;
          }
        }
        this.velocity.y = inUpdraft
          ? THREE.MathUtils.lerp(this.velocity.y, 10.6, dt * 6)
          : Math.max(-1.85, this.velocity.y - 6.5 * dt);
        this.highestAirY = this.position.y;
      } else if (!this.grounded) {
        this.velocity.y -= 23.5 * dt;
        this.highestAirY = Math.max(this.highestAirY, this.position.y);
      }

      this.position.addScaledVector(this.velocity, dt);

      const rawGround = getTerrainHeight(this.position.x, this.position.z);
      const supportTop = this.getWalkableSupportY(
        this.position.x,
        this.position.z,
        this.position.y,
        collisionWorld,
      );
      const solidGround = Math.max(rawGround, supportTop);
      const localWaterY = getWaterSurfaceY(this.position.x, this.position.z);
      // Mona & Ayaka sprint skates smoothly across BOTH Starfell Lake & Statue Pool!
      const effectiveFloor = this.altSprintActive !== 'none' ? Math.max(solidGround, localWaterY + 0.05) : solidGround;
      const nextNormal = getTerrainNormal(this.position.x, this.position.z, this.tmpNormal);

      if (this.position.y <= effectiveFloor + 0.08 && this.velocity.y <= 0.5) {
        if (!this.grounded && nextNormal.y < 0.56 && supportTop < rawGround + 0.05 && hasMove && this.stamina > 12 && this.altSprintActive === 'none') {
          this.climbing = true;
          this.climbNormal.copy(nextNormal);
          this.facingAngle = Math.atan2(-nextNormal.x, -nextNormal.z);
        } else {
          if (!this.grounded && !this.plunging && this.velocity.y < -12) {
            const dropHeight = this.highestAirY - effectiveFloor;
            if (dropHeight > 12) {
              this.onFallDamage?.(Math.round((dropHeight - 11) * 145));
            }
          }
          if (!this.grounded && this.plunging) {
            this.plunging = false;
            this.onPlungeLand?.(this.position.clone());
          }
          this.position.y = effectiveFloor;
          this.velocity.y = 0;
          this.grounded = true;
          this.highestAirY = effectiveFloor;
        }
      } else if (this.position.y > effectiveFloor + 0.28) {
        this.grounded = false;
        if (
          nextNormal.y < 0.55 &&
          supportTop < rawGround + 0.05 &&
          this.position.y - rawGround < 1.1 &&
          hasMove &&
          this.stamina > 15 &&
          this.altSprintActive === 'none'
        ) {
          this.climbing = true;
          this.climbNormal.copy(nextNormal);
          this.facingAngle = Math.atan2(-nextNormal.x, -nextNormal.z);
        }
      }
    }

    // Multi-pass solid cylinder & oriented-box collision resolution with smooth wall sliding
    this.resolveSolidCollisions(collisionWorld);

    const bound = WORLD_HALF - 14;
    this.position.x = Math.max(-bound, Math.min(bound, this.position.x));
    this.position.z = Math.max(-bound, Math.min(bound, this.position.z));

    if (this.staminaRegenDelay > 0) {
      this.staminaRegenDelay -= dt;
    } else if (!this.swimming && (this.grounded || (!this.gliding && !this.climbing && !this.sprinting))) {
      this.stamina = Math.min(this.maxStamina, this.stamina + 38 * dt);
    }

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && horizSpeed > 1.5 && this.altSprintActive === 'none') {
      this.footstepTimer -= dt * (this.sprinting ? 1.55 : 1.0);
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.36;
        this.sound.playFootstep(getSurfaceType(this.position.x, this.position.z));
      }
    }

    if (this.activeRig) {
      this.activeRig.root.position.copy(this.position);
      this.activeRig.root.rotation.y = this.facingAngle;

      let anim: AnimState = 'idle';
      if (this.animStateOverride) {
        anim = this.animStateOverride;
      } else if (this.plunging) {
        anim = 'plunge';
      } else if (this.swimming) {
        anim = 'swim';
      } else if (this.climbing) {
        anim = 'climb';
      } else if (this.gliding) {
        anim = 'glide';
      } else if (!this.grounded) {
        anim = this.velocity.y > 0.5 ? 'jump' : 'fall';
      } else if (horizSpeed > 8.2) {
        anim = 'sprint';
      } else if (horizSpeed > 2.8) {
        anim = 'run';
      } else if (horizSpeed > 0.4) {
        anim = 'walk';
      }

      this.activeRig.updateAnimation(dt, anim, Math.min(1, horizSpeed / 10));
    }

    this.updateCamera(dt);
  }

  public startPlungeAttack(): boolean {
    if (this.grounded || this.swimming || this.climbing || this.plunging) return false;
    const hAbove = this.position.y - getTerrainHeight(this.position.x, this.position.z);
    if (hAbove < 1.8) return false;
    this.gliding = false;
    this.plunging = true;
    this.velocity.y = -28;
    return true;
  }

  private consumeStamina(amount: number): void {
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaRegenDelay = 0.8;
  }

  private updateCamera(dt: number): void {
    let dist = this.cameraDistance;
    let targetFov = 58;
    if (this.burstCamTimer > 0) {
      this.burstCamTimer -= dt;
      dist = Math.max(3.1, dist * 0.6);
      targetFov = 67;
    }
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();

    const targetPos = this.camLookTarget.set(this.position.x, this.position.y + 1.48, this.position.z);
    const cosP = Math.cos(this.cameraPitch);
    const sinP = Math.sin(this.cameraPitch);
    const sinY = Math.sin(this.cameraYaw);
    const cosY = Math.cos(this.cameraYaw);

    const camPos = new THREE.Vector3(
      targetPos.x + sinY * cosP * dist,
      targetPos.y + sinP * dist,
      targetPos.z + cosY * cosP * dist,
    );

    const terrainAtCam = getTerrainHeight(camPos.x, camPos.z);
    if (camPos.y < terrainAtCam + 0.6) {
      camPos.y = terrainAtCam + 0.6;
    }

    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      camPos.x += (Math.random() - 0.5) * this.shakeStrength;
      camPos.y += (Math.random() - 0.5) * this.shakeStrength;
      if (this.shakeTimer <= 0) this.shakeStrength = 0;
    }

    this.camera.position.lerp(camPos, Math.min(1, dt * 18));
    this.camera.lookAt(targetPos);
  }

  private getWalkableSupportY(x: number, z: number, curY: number, world: CollisionWorld): number {
    let topY = -9999;
    const stepHeight = 0.85;
    const footPad = 0.22;

    for (let i = 0; i < world.cylinders.length; i++) {
      const c = world.cylinders[i];
      if (!c.walkableTop) continue;
      if (curY + stepHeight < c.maxY) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const r = c.radius + footPad;
      if (dx * dx + dz * dz <= r * r && c.maxY > topY) {
        topY = c.maxY;
      }
    }

    for (let i = 0; i < world.boxes.length; i++) {
      const b = world.boxes[i];
      if (!b.walkableTop) continue;
      if (curY + stepHeight < b.maxY) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      const cos = Math.cos(b.rotY);
      const sin = Math.sin(b.rotY);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) <= b.halfW + footPad && Math.abs(lz) <= b.halfD + footPad && b.maxY > topY) {
        topY = b.maxY;
      }
    }
    return topY;
  }

  private resolveSolidCollisions(world: CollisionWorld): void {
    const pRadius = 0.45;
    const pHeight = 1.7;
    const stepClearance = 0.72;

    for (let iter = 0; iter < 3; iter++) {
      // 1. Solid Cylinder Colliders
      for (let i = 0; i < world.cylinders.length; i++) {
        const c = world.cylinders[i];
        if (this.position.y + pHeight <= c.minY) continue;
        // Allow stepping smoothly onto walkable tops
        const topCutoff = c.walkableTop ? c.maxY - stepClearance : c.maxY - 0.1;
        if (this.position.y >= topCutoff) continue;

        const dx = this.position.x - c.x;
        const dz = this.position.z - c.z;
        const minD = c.radius + pRadius;
        const dSq = dx * dx + dz * dz;
        if (dSq < minD * minD) {
          const d = Math.sqrt(dSq);
          const nx = d > 1e-5 ? dx / d : 1;
          const nz = d > 1e-5 ? dz / d : 0;
          const overlap = minD - d;
          this.position.x += nx * overlap;
          this.position.z += nz * overlap;
          // Slide velocity cleanly along obstacle tangent
          const vn = this.velocity.x * nx + this.velocity.z * nz;
          if (vn < 0) {
            this.velocity.x -= nx * vn;
            this.velocity.z -= nz * vn;
          }
        }
      }

      // 2. Oriented Box Colliders (cottages, bridge walls, domain pillars)
      for (let i = 0; i < world.boxes.length; i++) {
        const b: BoxCollider = world.boxes[i];
        if (this.position.y + pHeight <= b.minY) continue;
        const topCutoff = b.walkableTop ? b.maxY - stepClearance : b.maxY - 0.1;
        if (this.position.y >= topCutoff) continue;

        const dx = this.position.x - b.x;
        const dz = this.position.z - b.z;
        const cos = Math.cos(b.rotY);
        const sin = Math.sin(b.rotY);
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;

        const cx = Math.max(-b.halfW, Math.min(b.halfW, lx));
        const cz = Math.max(-b.halfD, Math.min(b.halfD, lz));
        const rx = lx - cx;
        const rz = lz - cz;
        const distSq = rx * rx + rz * rz;

        if (distSq < pRadius * pRadius) {
          let pushLX = 0;
          let pushLZ = 0;
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const overlap = pRadius - dist;
            pushLX = (rx / dist) * overlap;
            pushLZ = (rz / dist) * overlap;
          } else {
            // Inside box center -> push out along shortest axis
            const penX = b.halfW + pRadius - Math.abs(lx);
            const penZ = b.halfD + pRadius - Math.abs(lz);
            if (penX < penZ) pushLX = lx >= 0 ? penX : -penX;
            else pushLZ = lz >= 0 ? penZ : -penZ;
          }

          // Transform push back into world space (Three.js +rotY around +Y)
          const wx = pushLX * cos + pushLZ * sin;
          const wz = -pushLX * sin + pushLZ * cos;
          this.position.x += wx;
          this.position.z += wz;

          const pLen = Math.hypot(wx, wz);
          if (pLen > 1e-5) {
            const nx = wx / pLen;
            const nz = wz / pLen;
            const vn = this.velocity.x * nx + this.velocity.z * nz;
            if (vn < 0) {
              this.velocity.x -= nx * vn;
              this.velocity.z -= nz * vn;
            }
          }
        }
      }
    }
  }

  private lerpAngle(a: number, b: number, t: number): number {
    const twoPi = Math.PI * 2;
    const diff = ((((b - a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
    return a + diff * Math.min(1, t);
  }
}
