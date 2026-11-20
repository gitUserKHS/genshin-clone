import * as THREE from 'three';
import {
  ELEMENT_COLORS,
  type ActiveChallengeHUD,
  type ElementalAura,
  type ElementType,
  type EnemySnapshot,
} from '../core/Types';
import { createToonGradientMap } from '../world/FoliageSystem';
import { DOMAIN_GATE_POS } from '../world/Landmarks';
import { getTerrainHeight, WATER_Y, WORLD_LANDMARKS } from '../world/Terrain';
import { resolveHitAndReaction, type ReactionOutcome } from './ElementalSystem';
import type { VFXSystem } from './VFXSystem';

export type EnemyKind = 'slime' | 'hilichurl' | 'shooter' | 'abyss_mage' | 'ruin_guard';

export interface EnemyUnit {
  id: string;
  kind: EnemyKind;
  nameKr: string;
  level: number;
  isBoss: boolean;
  isDomainEnemy?: boolean;
  element: ElementType;
  campId?: string;
  spawnPos: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  shieldHp: number;
  shieldMaxHp: number;
  shieldElement: ElementType | null;
  atk: number;
  alive: boolean;
  respawnTimer: number;
  aggroed: boolean;
  aura: ElementalAura | null;
  frozenTimer: number;
  petrifiedTimer: number;
  defDownTimer: number;
  omenTimer: number;
  attackCooldown: number;
  telegraphTimer: number;
  activePattern: 'none' | 'slam' | 'spin' | 'missiles' | 'shot';
  patternTimer: number;
  mesh: THREE.Group;
  bodyParts: {
    core?: THREE.Object3D;
    leftArm?: THREE.Object3D;
    rightArm?: THREE.Object3D;
    iceBlock?: THREE.Mesh;
    petrifyShell?: THREE.Mesh;
    mageBarrier?: THREE.Mesh;
    telegraphRing?: THREE.Mesh;
  };
}

interface EnemyMissile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  damage: number;
  element: ElementType;
}

export interface HitFeedback {
  enemy: EnemyUnit;
  outcome: ReactionOutcome;
  worldHitPos: THREE.Vector3;
  killed: boolean;
  shieldBroken: boolean;
}

export class EnemySystem {
  public readonly enemies: EnemyUnit[] = [];
  private readonly missiles: EnemyMissile[] = [];
  private readonly toonMap = createToonGradientMap();
  private elapsed = 0;

  // Domain 3-Wave Challenge State
  public domainActive = false;
  public domainWave = 0;
  private domainTimer = 0;
  private domainRingMesh: THREE.Mesh | null = null;
  public onDomainWaveChanged?: (wave: number) => void;
  public onDomainCleared?: () => void;
  public onDomainFailed?: () => void;

  constructor(private readonly scene: THREE.Scene, private readonly vfx: VFXSystem) {
    this.spawnAllWorldEnemies();
  }

  public startDomainTrial(): void {
    this.stopDomainTrial();
    this.domainActive = true;
    this.domainWave = 1;
    this.domainTimer = 120;

    const cx = DOMAIN_GATE_POS.x - 10;
    const cz = DOMAIN_GATE_POS.z + 4;
    const cy = getTerrainHeight(cx, cz);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x5ce4ff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.domainRingMesh = new THREE.Mesh(new THREE.RingGeometry(13.2, 14.0, 48), ringMat);
    this.domainRingMesh.rotation.x = -Math.PI / 2;
    this.domainRingMesh.position.set(cx, cy + 0.16, cz);
    this.scene.add(this.domainRingMesh);

    this.spawnDomainWave(1, cx, cz);
    this.onDomainWaveChanged?.(1);
  }

  public stopDomainTrial(): void {
    this.domainActive = false;
    this.domainWave = 0;
    if (this.domainRingMesh) {
      this.scene.remove(this.domainRingMesh);
      this.domainRingMesh.geometry.dispose();
      (this.domainRingMesh.material as THREE.Material).dispose();
      this.domainRingMesh = null;
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].isDomainEnemy) {
        this.scene.remove(this.enemies[i].mesh);
        this.enemies.splice(i, 1);
      }
    }
  }

  public getDomainHUD(): ActiveChallengeHUD | null {
    if (!this.domainActive) return null;
    const remaining = this.enemies.filter((e) => e.isDomainEnemy && e.alive).length;
    return {
      titleKr: `비경 시련 · 웨이브 ${this.domainWave}/3`,
      descKr: `남은 적 ${remaining}마리 처치`,
      timeLeft: this.domainTimer,
      progress: this.domainWave - 1,
      target: 3,
    };
  }

  private spawnDomainWave(wave: number, cx: number, cz: number): void {
    const tag = `dom_w${wave}`;
    if (wave === 1) {
      this.spawnSlime(`${tag}_1`, cx + 5, cz + 3, 'pyro', undefined, true);
      this.spawnSlime(`${tag}_2`, cx - 5, cz + 3, 'hydro', undefined, true);
      this.spawnSlime(`${tag}_3`, cx, cz - 5, 'cryo', undefined, true);
      this.spawnSlime(`${tag}_4`, cx + 4, cz - 4, 'electro', undefined, true);
    } else if (wave === 2) {
      this.spawnHilichurl(`${tag}_h1`, cx + 6, cz + 2, false, undefined, true);
      this.spawnHilichurl(`${tag}_h2`, cx - 6, cz + 2, true, undefined, true);
      this.spawnAbyssMage(`${tag}_m1`, cx, cz - 5, 'pyro', undefined, true);
      this.spawnAbyssMage(`${tag}_m2`, cx + 4, cz - 5, 'cryo', undefined, true);
    } else {
      this.spawnRuinGuard(cx, cz - 4, `${tag}_boss`, true);
      this.spawnAbyssMage(`${tag}_m3`, cx - 6, cz + 3, 'hydro', undefined, true);
    }
    // Immediately aggro spawned domain enemies
    for (const e of this.enemies) {
      if (e.isDomainEnemy && e.alive) e.aggroed = true;
    }
  }

  public getActiveCampIds(): Set<string> {
    const active = new Set<string>();
    for (const e of this.enemies) {
      if (e.alive && e.campId) active.add(e.campId);
    }
    return active;
  }

  public getSnapshots(): EnemySnapshot[] {
    return this.enemies
      .filter((e) => e.alive)
      .map((e) => ({
        id: e.id,
        nameKr: e.nameKr,
        level: e.level,
        isBoss: e.isBoss,
        hp: e.hp,
        maxHp: e.maxHp,
        shieldHp: e.shieldHp,
        shieldMaxHp: e.shieldMaxHp,
        shieldElement: e.shieldElement,
        aura: e.aura,
        worldPos: e.pos.clone(),
        heightOffset: e.height + 0.55,
        aggroed: e.aggroed,
        frozen: e.frozenTimer > 0,
        petrified: e.petrifiedTimer > 0,
        defDownTimer: e.defDownTimer,
        omenTimer: e.omenTimer,
        campId: e.campId,
      }));
  }

  public findNearestEnemy(pos: THREE.Vector3, maxRange: number): EnemyUnit | null {
    let best: EnemyUnit | null = null;
    let bestD = maxRange;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = pos.distanceTo(e.pos);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  public petrifyEnemiesInRadius(center: THREE.Vector3, radius: number, duration: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.pos.distanceTo(center) <= radius + e.radius) {
        e.petrifiedTimer = Math.max(e.petrifiedTimer, duration);
        if (e.bodyParts.petrifyShell) e.bodyParts.petrifyShell.visible = true;
      }
    }
  }

  public applyDamage(params: {
    enemy: EnemyUnit;
    rawDamage: number;
    element: ElementType;
    critRate: number;
    critDmg: number;
    isHeavyBlunt: boolean;
    knockbackDir?: THREE.Vector3;
    knockbackForce?: number;
    onEnemyKilled: (enemy: EnemyUnit) => void;
    onReactionFeedback: (fb: HitFeedback) => void;
  }): void {
    const { enemy } = params;
    if (!enemy.alive) return;

    const { outcome, nextAura } = resolveHitAndReaction({
      rawDamage: params.rawDamage,
      incomingElement: params.element,
      critRate: params.critRate,
      critDmg: params.critDmg,
      targetAura: enemy.aura,
      targetFrozen: enemy.frozenTimer > 0,
      targetOmen: enemy.omenTimer > 0,
      targetDefDown: enemy.defDownTimer > 0,
      isHeavyBlunt: params.isHeavyBlunt,
    });

    if (enemy.kind === 'slime' && !nextAura) {
      enemy.aura = { element: enemy.element, gauge: 0.8, timer: 4.0 };
    } else {
      enemy.aura = nextAura;
    }

    let shieldBroken = false;
    // Abyss Mage elemental barrier absorbs HP damage until broken!
    if (enemy.shieldHp > 0 && enemy.shieldElement) {
      const counterMult = this.getShieldBreakMultiplier(params.element, enemy.shieldElement);
      enemy.shieldHp = Math.max(0, enemy.shieldHp - outcome.finalDamage * counterMult);
      if (enemy.shieldHp <= 0) {
        shieldBroken = true;
        enemy.frozenTimer = 2.6; // Stunned on shield break!
        if (enemy.bodyParts.mageBarrier) enemy.bodyParts.mageBarrier.visible = false;
      }
    } else {
      enemy.hp = Math.max(0, enemy.hp - outcome.finalDamage);
    }

    if (outcome.applyFreeze) {
      enemy.frozenTimer = 3.5;
      if (enemy.bodyParts.iceBlock) enemy.bodyParts.iceBlock.visible = true;
    } else if (enemy.frozenTimer > 0 && params.isHeavyBlunt) {
      enemy.frozenTimer = 0;
      if (enemy.bodyParts.iceBlock) enemy.bodyParts.iceBlock.visible = false;
    }

    if (outcome.applyDefDown) enemy.defDownTimer = 8.0;

    enemy.aggroed = true;

    if (!enemy.isBoss && enemy.shieldHp <= 0 && (params.knockbackForce || outcome.knockbackForce > 0)) {
      const kb = (params.knockbackForce ?? 0) + outcome.knockbackForce;
      const dir = params.knockbackDir ?? enemy.pos.clone().sub(enemy.spawnPos).setY(0).normalize();
      enemy.vel.addScaledVector(dir, kb);
    }

    const hitPos = enemy.pos.clone().add(new THREE.Vector3(0, enemy.height * 0.65, 0));
    this.vfx.spawnHitBurst(hitPos, params.element, outcome.isCrit ? 12 : 7);

    const killed = enemy.hp <= 0;
    params.onReactionFeedback({
      enemy,
      outcome,
      worldHitPos: hitPos,
      killed,
      shieldBroken,
    });

    if (killed) {
      this.killEnemy(enemy, params.onEnemyKilled);
    }

    // Secondary Reaction AoE & Chain Lightning
    if (outcome.bonusAoeElement && outcome.bonusAoeRadius > 0) {
      this.vfx.spawnShockwave(enemy.pos, outcome.bonusAoeElement, outcome.bonusAoeRadius, 0.42);
      for (const other of this.enemies) {
        if (!other.alive || other === enemy) continue;
        if (other.pos.distanceTo(enemy.pos) <= outcome.bonusAoeRadius) {
          if (other.shieldHp > 0) {
            other.shieldHp = Math.max(0, other.shieldHp - outcome.bonusAoeDamage * 1.4);
            if (other.shieldHp <= 0 && other.bodyParts.mageBarrier) other.bodyParts.mageBarrier.visible = false;
          } else {
            other.hp = Math.max(0, other.hp - outcome.bonusAoeDamage);
          }
          other.aggroed = true;
          other.aura = { element: outcome.bonusAoeElement, gauge: 0.7, timer: 6.0 };
          if (outcome.triggerChainLightning) {
            this.vfx.spawnLightningArc(
              hitPos,
              other.pos.clone().add(new THREE.Vector3(0, other.height * 0.6, 0)),
              0xd082ff,
              0.28,
            );
          }
          if (other.hp <= 0) this.killEnemy(other, params.onEnemyKilled);
        }
      }
    }
  }

  private getShieldBreakMultiplier(incoming: ElementType, shield: ElementType): number {
    if (shield === 'pyro' && (incoming === 'hydro' || incoming === 'electro' || incoming === 'cryo')) return 2.6;
    if (shield === 'cryo' && (incoming === 'pyro' || incoming === 'electro')) return 2.6;
    if (shield === 'hydro' && (incoming === 'cryo' || incoming === 'electro')) return 2.4;
    if (incoming === 'anemo' || incoming === 'geo') return 1.5;
    if (incoming === shield) return 0.1;
    return 0.65;
  }

  private killEnemy(enemy: EnemyUnit, onEnemyKilled: (enemy: EnemyUnit) => void): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    enemy.respawnTimer = enemy.isDomainEnemy ? 99999 : enemy.isBoss ? 120 : 85;
    enemy.mesh.visible = false;
    enemy.aggroed = false;
    enemy.aura = null;
    enemy.frozenTimer = 0;
    enemy.petrifiedTimer = 0;
    if (enemy.bodyParts.iceBlock) enemy.bodyParts.iceBlock.visible = false;
    if (enemy.bodyParts.petrifyShell) enemy.bodyParts.petrifyShell.visible = false;
    if (enemy.bodyParts.telegraphRing) enemy.bodyParts.telegraphRing.visible = false;
    this.vfx.spawnHitBurst(enemy.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), enemy.element, 18);
    this.vfx.spawnEnergyOrbs(
      enemy.pos,
      enemy.element === 'physical' ? 'anemo' : enemy.element,
      enemy.isBoss ? 6 : 2,
      enemy.isBoss ? 9 : 4,
    );
    onEnemyKilled(enemy);
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    tauntTargetPos: THREE.Vector3 | null,
    onDamagePlayer: (dmg: number, sourcePos: THREE.Vector3) => void,
  ): { anyInCombat: boolean } {
    this.elapsed += dt;
    let anyInCombat = false;
    const chaseTarget = tauntTargetPos ?? playerPos;

    // Domain Wave Progression
    if (this.domainActive) {
      this.domainTimer -= dt;
      const aliveDomain = this.enemies.filter((e) => e.isDomainEnemy && e.alive).length;
      if (aliveDomain === 0) {
        if (this.domainWave < 3) {
          this.domainWave++;
          this.spawnDomainWave(this.domainWave, DOMAIN_GATE_POS.x - 10, DOMAIN_GATE_POS.z + 4);
          this.onDomainWaveChanged?.(this.domainWave);
        } else {
          this.stopDomainTrial();
          this.onDomainCleared?.();
        }
      } else if (this.domainTimer <= 0) {
        this.stopDomainTrial();
        this.onDomainFailed?.();
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) {
        if (e.isDomainEnemy) continue;
        e.respawnTimer -= dt;
        if (e.respawnTimer <= 0) {
          e.alive = true;
          e.hp = e.maxHp;
          e.shieldHp = e.shieldMaxHp;
          if (e.bodyParts.mageBarrier) e.bodyParts.mageBarrier.visible = e.shieldMaxHp > 0;
          e.pos.copy(e.spawnPos);
          e.vel.set(0, 0, 0);
          e.mesh.position.copy(e.pos);
          e.mesh.visible = true;
          e.aggroed = false;
          e.activePattern = 'none';
          e.aura = e.kind === 'slime' ? { element: e.element, gauge: 1, timer: 99 } : null;
        }
        continue;
      }

      if (e.defDownTimer > 0) e.defDownTimer -= dt;
      if (e.omenTimer > 0) e.omenTimer -= dt;
      if (e.aura) {
        e.aura.timer -= dt;
        if (e.aura.timer <= 0) {
          e.aura = e.kind === 'slime' ? { element: e.element, gauge: 1, timer: 99 } : null;
        }
      }

      if (e.petrifiedTimer > 0) {
        e.petrifiedTimer -= dt;
        if (e.petrifiedTimer <= 0 && e.bodyParts.petrifyShell) e.bodyParts.petrifyShell.visible = false;
        continue;
      }

      if (e.frozenTimer > 0) {
        e.frozenTimer -= dt;
        if (e.frozenTimer <= 0 && e.bodyParts.iceBlock) e.bodyParts.iceBlock.visible = false;
        continue;
      }

      const distToPlayer = e.pos.distanceTo(playerPos);
      const distToHome = e.pos.distanceTo(e.spawnPos);
      const aggroRadius = e.isBoss ? 25 : 17;

      if (!e.aggroed && distToPlayer < aggroRadius) {
        e.aggroed = true;
      } else if (e.aggroed && !e.isDomainEnemy && distToHome > 44 && distToPlayer > 28) {
        e.aggroed = false;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25);
      }

      if (e.aggroed) anyInCombat = true;
      if (e.attackCooldown > 0) e.attackCooldown -= dt;

      if (e.aggroed) {
        const toTarget = chaseTarget.clone().sub(e.pos);
        toTarget.y = 0;
        const targetDist = toTarget.length();
        const dir = targetDist > 0.01 ? toTarget.clone().divideScalar(targetDist) : new THREE.Vector3(0, 0, 1);
        const faceYaw = Math.atan2(dir.x, dir.z);

        if (e.kind === 'ruin_guard') {
          this.updateRuinGuard(e, dt, dir, targetDist, faceYaw, playerPos, onDamagePlayer);
        } else if (e.kind === 'abyss_mage') {
          e.mesh.rotation.y = faceYaw;
          const hover = Math.sin(this.elapsed * 3.2 + e.spawnPos.x) * 0.22;
          if (targetDist > 10) e.pos.addScaledVector(dir, 3.6 * dt);
          else if (targetDist < 5) e.pos.addScaledVector(dir, -2.5 * dt);
          if (e.attackCooldown <= 0 && targetDist < 22) {
            e.attackCooldown = 2.6;
            this.fireProjectile(
              e.pos.clone().add(new THREE.Vector3(0, 1.5, 0)),
              playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)),
              14.0,
              e.atk,
              e.element,
            );
          }
          e.mesh.position.y = getTerrainHeight(e.pos.x, e.pos.z) + 0.55 + hover;
        } else if (e.kind === 'shooter') {
          e.mesh.rotation.y = faceYaw;
          if (targetDist > 12) e.pos.addScaledVector(dir, 2.8 * dt);
          else if (targetDist < 5.5) e.pos.addScaledVector(dir, -2.5 * dt);
          if (e.attackCooldown <= 0 && targetDist < 20) {
            e.attackCooldown = 2.8;
            this.fireProjectile(
              e.pos.clone().add(new THREE.Vector3(0, 1.3, 0)),
              playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)),
              14.5,
              e.atk,
              'pyro',
            );
          }
        } else if (e.kind === 'slime') {
          e.mesh.rotation.y = faceYaw;
          if (e.activePattern === 'slam') {
            e.patternTimer -= dt;
            if (e.bodyParts.telegraphRing) {
              e.bodyParts.telegraphRing.visible = true;
              const pulse = 1 - Math.max(0, e.patternTimer) / 0.75;
              e.bodyParts.telegraphRing.scale.setScalar(0.5 + pulse * 0.5);
            }
            if (e.patternTimer <= 0) {
              e.activePattern = 'none';
              if (e.bodyParts.telegraphRing) e.bodyParts.telegraphRing.visible = false;
              this.vfx.spawnShockwave(e.pos, e.element, 2.8, 0.3);
              if (e.pos.distanceTo(playerPos) < 2.9) onDamagePlayer(e.atk, e.pos);
            }
          } else {
            if (targetDist > 2.2) {
              e.pos.addScaledVector(dir, 3.3 * dt);
              const hop = Math.abs(Math.sin(this.elapsed * 5.2 + e.spawnPos.x));
              e.mesh.scale.set(1 + (1 - hop) * 0.14, 0.85 + hop * 0.28, 1 + (1 - hop) * 0.14);
            }
            if (targetDist < 2.8 && e.attackCooldown <= 0) {
              e.activePattern = 'slam';
              e.patternTimer = 0.75;
              e.attackCooldown = 2.4;
            }
          }
        } else {
          e.mesh.rotation.y = faceYaw;
          if (targetDist > 2.1) {
            e.pos.addScaledVector(dir, 4.1 * dt);
          } else if (e.attackCooldown <= 0) {
            e.attackCooldown = 1.9;
            if (e.bodyParts.rightArm) e.bodyParts.rightArm.rotation.x = -1.6;
            if (e.pos.distanceTo(playerPos) < 2.6) onDamagePlayer(e.atk, e.pos);
          }
          if (e.bodyParts.rightArm) {
            e.bodyParts.rightArm.rotation.x = THREE.MathUtils.lerp(e.bodyParts.rightArm.rotation.x, 0, dt * 7);
          }
        }
      } else if (distToHome > 2.5) {
        const back = e.spawnPos.clone().sub(e.pos).setY(0).normalize();
        e.pos.addScaledVector(back, 2.4 * dt);
        e.mesh.rotation.y = Math.atan2(back.x, back.z);
      }

      if (e.vel.lengthSq() > 0.01) {
        e.pos.addScaledVector(e.vel, dt);
        e.vel.multiplyScalar(Math.exp(-7 * dt));
      }

      const groundY = Math.max(WATER_Y - 0.5, getTerrainHeight(e.pos.x, e.pos.z));
      e.pos.y = groundY;
      if (e.kind !== 'abyss_mage') {
        e.mesh.position.copy(e.pos);
      } else {
        e.mesh.position.x = e.pos.x;
        e.mesh.position.z = e.pos.z;
      }
    }

    // Update enemy projectiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.age += dt;
      if (m.element === 'physical' && m.age < 1.2) {
        const desired = playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)).sub(m.pos).normalize().multiplyScalar(13.5);
        m.vel.lerp(desired, dt * 2.2);
      }
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);

      const dPlayer = m.pos.distanceTo(playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)));
      const ground = getTerrainHeight(m.pos.x, m.pos.z);
      if (dPlayer < 1.15) {
        this.vfx.spawnHitBurst(m.pos, m.element === 'physical' ? 'pyro' : m.element, 8);
        onDamagePlayer(m.damage, m.pos);
        this.scene.remove(m.mesh);
        m.mesh.geometry.dispose();
        (m.mesh.material as THREE.Material).dispose();
        this.missiles.splice(i, 1);
      } else if (m.pos.y <= ground + 0.1 || m.age > 3.8) {
        this.vfx.spawnShockwave(new THREE.Vector3(m.pos.x, ground, m.pos.z), m.element === 'physical' ? 'pyro' : m.element, 2.0, 0.25);
        this.scene.remove(m.mesh);
        m.mesh.geometry.dispose();
        (m.mesh.material as THREE.Material).dispose();
        this.missiles.splice(i, 1);
      }
    }

    return { anyInCombat };
  }

  private updateRuinGuard(
    e: EnemyUnit,
    dt: number,
    dir: THREE.Vector3,
    targetDist: number,
    faceYaw: number,
    playerPos: THREE.Vector3,
    onDamagePlayer: (dmg: number, sourcePos: THREE.Vector3) => void,
  ): void {
    if (e.bodyParts.core) e.bodyParts.core.rotation.z += dt * 3.0;

    if (e.activePattern === 'spin') {
      e.patternTimer -= dt;
      e.mesh.rotation.y += dt * 11.0;
      e.pos.addScaledVector(dir, 5.2 * dt);
      if (e.bodyParts.leftArm) e.bodyParts.leftArm.rotation.z = 1.4;
      if (e.bodyParts.rightArm) e.bodyParts.rightArm.rotation.z = -1.4;

      if (e.telegraphTimer <= 0) {
        e.telegraphTimer = 0.55;
        this.vfx.spawnShockwave(e.pos, 'pyro', 4.0, 0.25);
        if (e.pos.distanceTo(playerPos) < 4.2) onDamagePlayer(e.atk * 0.75, e.pos);
      } else {
        e.telegraphTimer -= dt;
      }

      if (e.patternTimer <= 0) {
        e.activePattern = 'none';
        e.attackCooldown = 2.6;
        if (e.bodyParts.leftArm) e.bodyParts.leftArm.rotation.z = 0;
        if (e.bodyParts.rightArm) e.bodyParts.rightArm.rotation.z = 0;
      }
      return;
    }

    if (e.activePattern === 'slam') {
      e.patternTimer -= dt;
      if (e.bodyParts.telegraphRing) e.bodyParts.telegraphRing.visible = true;
      if (e.patternTimer <= 0) {
        e.activePattern = 'none';
        e.attackCooldown = 2.4;
        if (e.bodyParts.telegraphRing) e.bodyParts.telegraphRing.visible = false;
        this.vfx.spawnShockwave(e.pos, 'pyro', 6.5, 0.45);
        if (e.pos.distanceTo(playerPos) < 6.4) onDamagePlayer(e.atk * 1.35, e.pos);
      }
      return;
    }

    e.mesh.rotation.y = faceYaw;
    if (targetDist > 4.2) e.pos.addScaledVector(dir, 2.9 * dt);

    if (e.attackCooldown <= 0) {
      if (targetDist > 9.5) {
        e.attackCooldown = 4.2;
        for (let m = 0; m < 4; m++) {
          const offsetAngle = (m - 1.5) * 0.25;
          const launchDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), offsetAngle);
          launchDir.y = 0.48;
          launchDir.normalize();
          this.fireProjectile(
            e.pos.clone().add(new THREE.Vector3(0, 3.4, 0)),
            e.pos.clone().addScaledVector(launchDir, 12),
            12.5,
            Math.round(e.atk * 0.75),
            'physical',
          );
        }
      } else if (Math.random() < 0.52) {
        e.activePattern = 'slam';
        e.patternTimer = 0.9;
      } else {
        e.activePattern = 'spin';
        e.patternTimer = 3.2;
        e.telegraphTimer = 0.2;
      }
    }
  }

  private fireProjectile(
    start: THREE.Vector3,
    target: THREE.Vector3,
    speed: number,
    damage: number,
    element: ElementType,
  ): void {
    const col = element === 'physical' ? 0xff923d : ELEMENT_COLORS[element].hex;
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.3 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), mat);
    mesh.position.copy(start);
    this.scene.add(mesh);
    const vel = target.clone().sub(start).normalize().multiplyScalar(speed);
    this.missiles.push({ mesh, pos: start, vel, age: 0, damage, element });
  }

  private spawnAllWorldEnemies(): void {
    const slimeSpots: Array<{ x: number; z: number; element: ElementType; campId?: string }> = [
      { x: 14, z: 12, element: 'hydro' },
      { x: -15, z: 14, element: 'pyro' },
      { x: 22, z: -12, element: 'electro' },
      { x: -24, z: -26, element: 'hydro' },
      { x: -42, z: -34, element: 'cryo' },
      { x: -44, z: -48, element: 'hydro' },
      { x: 38, z: -36, element: 'pyro', campId: 'camp_meadow' },
      { x: 45, z: -41, element: 'electro', campId: 'camp_meadow' },
      { x: 64, z: -44, element: 'anemo' },
      { x: 92, z: -46, element: 'anemo' },
      { x: 74, z: 40, element: 'pyro' },
      { x: 22, z: -122, element: 'cryo', campId: 'camp_cliff' },
      { x: 14, z: -128, element: 'electro', campId: 'camp_cliff' },
      { x: -34, z: 32, element: 'pyro', campId: 'camp_road' },
      { x: -38, z: 38, element: 'cryo', campId: 'camp_road' },
    ];
    slimeSpots.forEach((sp, i) => this.spawnSlime(`slime_${i}`, sp.x, sp.z, sp.element, sp.campId));

    // Hilichurl camps
    this.spawnHilichurlCamp('camp_road', -36, 36, 3);
    this.spawnHilichurlCamp('camp_meadow', 42, -38, 3);
    this.spawnHilichurlCamp('camp_forest', -86, -104, 4);
    this.spawnHilichurlCamp('camp_cliff', 18, -124, 2);

    // Abyss Mages guarding iconic spots!
    this.spawnAbyssMage('mage_lake', -46, -40, 'cryo');
    this.spawnAbyssMage('mage_meadow', 46, -34, 'pyro', 'camp_meadow');
    this.spawnAbyssMage('mage_forest', -90, -100, 'hydro', 'camp_forest');

    // Ruin Guard Elite Boss
    this.spawnRuinGuard(WORLD_LANDMARKS.ruins.x, WORLD_LANDMARKS.ruins.z);
  }

  private spawnSlime(
    id: string,
    x: number,
    z: number,
    element: ElementType,
    campId?: string,
    isDomainEnemy = false,
  ): void {
    const y = getTerrainHeight(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const col = ELEMENT_COLORS[element].hex;
    const bodyMat = new THREE.MeshToonMaterial({
      color: col,
      gradientMap: this.toonMap,
      transparent: true,
      opacity: 0.9,
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 14), bodyMat);
    body.position.y = 0.62;
    body.scale.set(1.12, 0.88, 1.12);
    body.castShadow = true;
    group.add(body);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const s of [-0.22, 0.22]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
      eye.position.set(s, 0.68, 0.68);
      group.add(eye);
    }

    const crestMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.5 });
    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), crestMat);
    crest.position.y = 1.38;
    group.add(crest);

    const iceBlock = this.createIceBlock(1.4);
    const petrifyShell = this.createPetrifyShell(1.45);
    const telegraphRing = this.createTelegraphRing(2.8);
    group.add(iceBlock, petrifyShell, telegraphRing);

    this.scene.add(group);
    const nameMap: Record<ElementType, string> = {
      anemo: '바람 슬라임',
      pyro: '화염 슬라임',
      hydro: '물 슬라임',
      electro: '번개 슬라임',
      cryo: '얼음 슬라임',
      geo: '바위 슬라임',
      physical: '슬라임',
    };

    this.enemies.push({
      id,
      kind: 'slime',
      nameKr: nameMap[element],
      level: 50,
      isBoss: false,
      isDomainEnemy,
      element,
      campId,
      spawnPos: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      radius: 0.78,
      height: 1.35,
      hp: 4200,
      maxHp: 4200,
      shieldHp: 0,
      shieldMaxHp: 0,
      shieldElement: null,
      atk: 280,
      alive: true,
      respawnTimer: 0,
      aggroed: false,
      aura: { element, gauge: 1, timer: 99 },
      frozenTimer: 0,
      petrifiedTimer: 0,
      defDownTimer: 0,
      omenTimer: 0,
      attackCooldown: 1.0,
      telegraphTimer: 0,
      activePattern: 'none',
      patternTimer: 0,
      mesh: group,
      bodyParts: { iceBlock, petrifyShell, telegraphRing },
    });
  }

  private spawnAbyssMage(
    id: string,
    x: number,
    z: number,
    element: ElementType,
    campId?: string,
    isDomainEnemy = false,
  ): void {
    const y = getTerrainHeight(x, z);
    const group = new THREE.Group();
    group.position.set(x, y + 0.55, z);

    const col = ELEMENT_COLORS[element].hex;
    const robeMat = new THREE.MeshToonMaterial({ color: col, gradientMap: this.toonMap });
    const furMat = new THREE.MeshToonMaterial({ color: 0xf4f0e8, gradientMap: this.toonMap });
    const maskMat = new THREE.MeshToonMaterial({ color: 0x22202b, gradientMap: this.toonMap });

    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.25, 10), robeMat);
    robe.position.y = 0.7;
    robe.castShadow = true;
    group.add(robe);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 14), furMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.25;
    group.add(collar);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), maskMat);
    head.position.y = 1.48;
    group.add(head);

    // Tall pointed rabbit-ear Abyss Mage hood
    for (const s of [-0.14, 0.14]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), robeMat);
      ear.position.set(s, 1.85, 0);
      ear.rotation.z = s > 0 ? -0.18 : 0.18;
      group.add(ear);
    }

    // Translucent elemental barrier sphere!
    const barrierMat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
    });
    const mageBarrier = new THREE.Mesh(new THREE.IcosahedronGeometry(1.18, 1), barrierMat);
    mageBarrier.position.y = 1.05;
    group.add(mageBarrier);

    const iceBlock = this.createIceBlock(1.8);
    const petrifyShell = this.createPetrifyShell(1.85);
    group.add(iceBlock, petrifyShell);

    this.scene.add(group);
    this.enemies.push({
      id,
      kind: 'abyss_mage',
      nameKr: `${ELEMENT_COLORS[element].labelKr} 심연 메이지`,
      level: 65,
      isBoss: false,
      isDomainEnemy,
      element,
      campId,
      spawnPos: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      radius: 0.9,
      height: 2.15,
      hp: 6200,
      maxHp: 6200,
      shieldHp: 4800,
      shieldMaxHp: 4800,
      shieldElement: element,
      atk: 420,
      alive: true,
      respawnTimer: 0,
      aggroed: false,
      aura: { element, gauge: 1, timer: 99 },
      frozenTimer: 0,
      petrifiedTimer: 0,
      defDownTimer: 0,
      omenTimer: 0,
      attackCooldown: 1.6,
      telegraphTimer: 0,
      activePattern: 'none',
      patternTimer: 0,
      mesh: group,
      bodyParts: { mageBarrier, iceBlock, petrifyShell },
    });
  }

  private spawnHilichurlCamp(campId: string, cx: number, cz: number, count: number): void {
    const fy = getTerrainHeight(cx, cz);
    const fireGroup = new THREE.Group();
    fireGroup.position.set(cx, fy, cz);
    const logMat = new THREE.MeshToonMaterial({ color: 0x5c3a22, gradientMap: this.toonMap });
    for (let l = 0; l < 4; l++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.0, 6), logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (l * Math.PI) / 4;
      log.position.y = 0.08;
      fireGroup.add(log);
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.75, 7),
      new THREE.MeshStandardMaterial({ color: 0xff7729, emissive: 0xff521b, emissiveIntensity: 2.3 }),
    );
    flame.position.y = 0.42;
    fireGroup.add(flame);
    this.scene.add(fireGroup);

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.4;
      this.spawnHilichurl(`${campId}_h_${i}`, cx + Math.cos(a) * 3.8, cz + Math.sin(a) * 3.8, i === count - 1, campId);
    }
  }

  private spawnHilichurl(
    id: string,
    x: number,
    z: number,
    isShooter: boolean,
    campId?: string,
    isDomainEnemy = false,
  ): void {
    const y = getTerrainHeight(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const skinMat = new THREE.MeshToonMaterial({ color: 0x38323e, gradientMap: this.toonMap });
    const maskMat = new THREE.MeshToonMaterial({ color: 0xeee8dc, gradientMap: this.toonMap });
    const maneMat = new THREE.MeshToonMaterial({ color: 0x6b564a, gradientMap: this.toonMap });
    const eyeMat = new THREE.MeshBasicMaterial({ color: isShooter ? 0xff6b3d : 0xffe066 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.82, 8), skinMat);
    body.position.y = 0.95;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), skinMat);
    head.position.y = 1.56;
    group.add(head);

    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.14), maskMat);
    mask.position.set(0, 1.56, 0.22);
    group.add(mask);

    for (const s of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
      eye.position.set(s, 1.58, 0.3);
      group.add(eye);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), maskMat);
      horn.position.set(s * 2.1, 1.82, 0.08);
      horn.rotation.z = s > 0 ? -0.35 : 0.35;
      group.add(horn);
    }

    const mane = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.42, 7), maneMat);
    mane.position.set(0, 1.52, -0.14);
    group.add(mane);

    const rightArm = new THREE.Group();
    rightArm.position.set(-0.32, 1.28, 0);
    const club = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.11, isShooter ? 0.8 : 0.95, 6),
      new THREE.MeshToonMaterial({ color: isShooter ? 0xa63a2b : 0x6b472b, gradientMap: this.toonMap }),
    );
    club.rotation.x = Math.PI / 2;
    club.position.set(0, -0.3, 0.35);
    rightArm.add(club);
    group.add(rightArm);

    for (const s of [-0.13, 0.13]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.56, 6), skinMat);
      leg.position.set(s, 0.28, 0);
      group.add(leg);
    }

    const iceBlock = this.createIceBlock(1.85);
    const petrifyShell = this.createPetrifyShell(1.9);
    group.add(iceBlock, petrifyShell);

    this.scene.add(group);
    this.enemies.push({
      id,
      kind: isShooter ? 'shooter' : 'hilichurl',
      nameKr: isShooter ? '화염 츄츄 궁수' : '츄츄족 전사',
      level: 55,
      isBoss: false,
      isDomainEnemy,
      element: 'physical',
      campId,
      spawnPos: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      radius: 0.65,
      height: 1.9,
      hp: isShooter ? 4800 : 6200,
      maxHp: isShooter ? 4800 : 6200,
      shieldHp: 0,
      shieldMaxHp: 0,
      shieldElement: null,
      atk: isShooter ? 340 : 390,
      alive: true,
      respawnTimer: 0,
      aggroed: false,
      aura: null,
      frozenTimer: 0,
      petrifiedTimer: 0,
      defDownTimer: 0,
      omenTimer: 0,
      attackCooldown: 1.2,
      telegraphTimer: 0,
      activePattern: 'none',
      patternTimer: 0,
      mesh: group,
      bodyParts: { rightArm, iceBlock, petrifyShell },
    });
  }

  private spawnRuinGuard(x: number, z: number, id = 'boss_ruin_guard', isDomainEnemy = false): void {
    const y = getTerrainHeight(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const bronzeMat = new THREE.MeshToonMaterial({ color: 0x73634a, gradientMap: this.toonMap });
    const darkMetalMat = new THREE.MeshToonMaterial({ color: 0x3b3632, gradientMap: this.toonMap });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff6a00, emissiveIntensity: 2.6 });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.85, 2.0, 8), bronzeMat);
    torso.position.y = 2.65;
    torso.castShadow = true;
    group.add(torso);

    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.75, 1.4), darkMetalMat);
    shoulders.position.y = 3.5;
    shoulders.castShadow = true;
    group.add(shoulders);

    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.72, 8), bronzeMat);
    head.position.y = 4.15;
    group.add(head);

    const core = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 8, 16), coreMat);
    core.position.set(0, 4.15, 0.62);
    group.add(core);

    const eyeCenter = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), coreMat);
    eyeCenter.position.set(0, 4.15, 0.65);
    group.add(eyeCenter);

    const leftArm = new THREE.Group();
    leftArm.position.set(1.55, 3.45, 0);
    const lArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.2, 0.65), bronzeMat);
    lArmMesh.position.y = -1.0;
    lArmMesh.castShadow = true;
    leftArm.add(lArmMesh);
    group.add(leftArm);

    const rightArm = new THREE.Group();
    rightArm.position.set(-1.55, 3.45, 0);
    const rArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.2, 0.65), bronzeMat);
    rArmMesh.position.y = -1.0;
    rArmMesh.castShadow = true;
    rightArm.add(rArmMesh);
    group.add(rightArm);

    for (const s of [-0.62, 0.62]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.7, 0.75), darkMetalMat);
      leg.position.set(s, 0.85, 0);
      leg.castShadow = true;
      group.add(leg);
    }

    const iceBlock = this.createIceBlock(4.4);
    const petrifyShell = this.createPetrifyShell(4.5);
    const telegraphRing = this.createTelegraphRing(6.5);
    group.add(iceBlock, petrifyShell, telegraphRing);

    this.scene.add(group);
    this.enemies.push({
      id,
      kind: 'ruin_guard',
      nameKr: isDomainEnemy ? '비경 유적 가디언 · 시련의 수호자' : '유적 가디언 · 고대의 수호자',
      level: 85,
      isBoss: true,
      isDomainEnemy,
      element: 'physical',
      campId: isDomainEnemy ? undefined : 'camp_ruins_boss',
      spawnPos: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      radius: 1.5,
      height: 4.6,
      hp: isDomainEnemy ? 32000 : 42000,
      maxHp: isDomainEnemy ? 32000 : 42000,
      shieldHp: 0,
      shieldMaxHp: 0,
      shieldElement: null,
      atk: 780,
      alive: true,
      respawnTimer: 0,
      aggroed: false,
      aura: null,
      frozenTimer: 0,
      petrifiedTimer: 0,
      defDownTimer: 0,
      omenTimer: 0,
      attackCooldown: 1.8,
      telegraphTimer: 0,
      activePattern: 'none',
      patternTimer: 0,
      mesh: group,
      bodyParts: { core, leftArm, rightArm, iceBlock, petrifyShell, telegraphRing },
    });
  }

  private createIceBlock(size: number): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xa5f5ff,
      emissive: 0x3ad5ff,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 0.52,
      roughness: 0.15,
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(size * 0.8, size, size * 0.8), mat);
    m.position.y = size * 0.5;
    m.visible = false;
    return m;
  }

  private createPetrifyShell(size: number): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd9a83b,
      emissive: 0x8f6214,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.62,
      roughness: 0.4,
    });
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.52, 0), mat);
    m.position.y = size * 0.5;
    m.visible = false;
    return m;
  }

  private createTelegraphRing(radius: number): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff3b3b,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 32), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.14;
    ring.visible = false;
    return ring;
  }
}
