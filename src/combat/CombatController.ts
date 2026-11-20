import * as THREE from 'three';
import type { SoundEngine } from '../audio/SoundEngine';
import { CHARACTERS } from '../characters/CharacterData';
import type { PlayerController } from '../characters/PlayerController';
import type { InputManager } from '../core/InputManager';
import type { CharacterId, CharacterRuntime, ElementType } from '../core/Types';
import type { ProgressionSystem } from '../systems/ProgressionSystem';
import type { MonumentNode, WorldInteractables } from '../world/WorldInteractables';
import type { EnemySystem, EnemyUnit, HitFeedback } from './EnemySystem';
import type { ActiveSkillEntity, VFXSystem } from './VFXSystem';

export interface CombatCallbacks {
  onDamageDisplay: (worldPos: THREE.Vector3, amount: number, element: ElementType, isCrit: boolean) => void;
  onReactionDisplay: (worldPos: THREE.Vector3, text: string, colorCss: string) => void;
  onBurstCutIn: (charId: CharacterId) => void;
  onMonumentLit: (mon: MonumentNode, puzzleSolved: boolean) => void;
  onEnemyDefeated: (enemy: EnemyUnit) => void;
}

export class CombatController {
  private comboStep = 0;
  private comboResetTimer = 0;
  private attackCooldown = 0;
  private attackBufferTimer = 0;
  private chargedFired = false;

  private dilucSkillCharges = 0;
  private dilucWindowTimer = 0;

  public activeTauntPos: THREE.Vector3 | null = null;

  constructor(
    private readonly player: PlayerController,
    private readonly enemies: EnemySystem,
    private readonly vfx: VFXSystem,
    private readonly interactables: WorldInteractables,
    private readonly progression: ProgressionSystem,
    private readonly sound: SoundEngine,
    private readonly callbacks: CombatCallbacks,
  ) {
    this.player.onPlungeLand = (pos) => {
      const char = this.progression.getActiveCharacter();
      const def = CHARACTERS[char.id];
      const elem: ElementType =
        char.infusionTimer > 0 && char.infusionElement
          ? char.infusionElement
          : def.weaponType === 'catalyst'
            ? def.element
            : 'physical';
      this.vfx.spawnShockwave(pos, elem === 'physical' ? def.element : elem, 5.0, 0.45);
      this.sound.playHit(def.element, true);
      this.player.triggerCameraShake(0.28, 0.24);
      this.damageEnemiesInSphere(pos, 5.0, 1.9, elem, true, char);
    };

    // Mona & Ayaka Alternate Sprint exit splash + Ayaka Cryo infusion!
    this.player.onAltSprintExit = (mode, pos) => {
      const elem: ElementType = mode === 'cryo' ? 'cryo' : 'hydro';
      this.vfx.spawnShockwave(pos, elem, 3.8, 0.35);
      const char = this.progression.getActiveCharacter();
      if (mode === 'cryo' && char.id === 'ayaka') {
        char.infusionTimer = 5.0;
        char.infusionElement = 'cryo';
      }
      this.damageEnemiesInSphere(pos, 3.8, 0.65, elem, false, char);
    };
  }

  public clearTransientInput(): void {
    this.chargedFired = false;
    this.attackBufferTimer = 0;
  }

  public triggerSkill(): void {
    const activeChar = this.progression.getActiveCharacter();
    if (!activeChar.isAlive || this.player.swimming) return;
    this.tryCastSkill(activeChar);
  }

  public triggerBurst(): void {
    const activeChar = this.progression.getActiveCharacter();
    if (!activeChar.isAlive || this.player.swimming) return;
    this.tryCastBurst(activeChar);
  }

  public update(dt: number, input: InputManager): void {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.attackBufferTimer > 0) this.attackBufferTimer -= dt;
    if (this.comboResetTimer > 0) {
      this.comboResetTimer -= dt;
      if (this.comboResetTimer <= 0) this.comboStep = 0;
    }
    if (this.dilucWindowTimer > 0) {
      this.dilucWindowTimer -= dt;
      if (this.dilucWindowTimer <= 0) this.dilucSkillCharges = 0;
    }

    for (const c of Object.values(this.progression.party)) {
      if (c.skillCd > 0) c.skillCd = Math.max(0, c.skillCd - dt);
      if (c.burstCd > 0) c.burstCd = Math.max(0, c.burstCd - dt);
      if (c.infusionTimer > 0) {
        c.infusionTimer = Math.max(0, c.infusionTimer - dt);
        if (c.infusionTimer <= 0) c.infusionElement = null;
      }
    }

    const activeChar = this.progression.getActiveCharacter();
    if (!activeChar.isAlive) return;

    // 1. Plunge Attack while airborne
    if (input.mouseLeftJustPressed && !this.player.grounded && !this.player.swimming) {
      if (this.player.startPlungeAttack()) return;
    }

    // 2. Charged Attack on hold >= 0.34s
    if (input.mouseLeftDown && !this.chargedFired && input.mouseLeftHoldTime >= 0.34 && this.player.grounded) {
      this.chargedFired = true;
      this.performChargedAttack(activeChar);
    }
    if (input.mouseLeftJustReleased) {
      if (!this.chargedFired && input.mouseLeftHoldTime < 0.34 && this.player.grounded) {
        this.attackBufferTimer = 0.18;
      }
      this.chargedFired = false;
    }
    if (this.attackBufferTimer > 0 && this.attackCooldown <= 0 && this.player.grounded) {
      this.attackBufferTimer = 0;
      this.performNormalAttack(activeChar);
    }

    // 3. Skill (E) & Burst (Q)
    if (input.wasKeyPressed('KeyE') && !this.player.swimming) {
      this.tryCastSkill(activeChar);
    }
    if (input.wasKeyPressed('KeyQ') && !this.player.swimming) {
      this.tryCastBurst(activeChar);
    }
  }

  public handleSkillEntityTick(entity: ActiveSkillEntity): void {
    const ownerMap: Record<ActiveSkillEntity['kind'], CharacterId> = {
      tornado: 'traveler',
      phoenix: 'diluc',
      mona_phantom: 'mona',
      mona_dome: 'mona',
      ayaka_storm: 'ayaka',
      zhongli_stele: 'zhongli',
      zhongli_meteor: 'zhongli',
    };
    const char = this.progression.party[ownerMap[entity.kind]];

    if (entity.kind === 'tornado') {
      for (const e of this.enemies.enemies) {
        if (!e.alive) continue;
        if (e.pos.distanceTo(entity.pos) < entity.radius + 1.5) {
          if (!e.isBoss) {
            const pull = entity.pos.clone().sub(e.pos).setY(0).normalize();
            e.pos.addScaledVector(pull, 1.35);
          }
          if (!entity.absorbedElement && e.aura && ['pyro', 'hydro', 'electro', 'cryo'].includes(e.aura.element)) {
            entity.absorbedElement = e.aura.element;
          }
        }
      }
      this.damageEnemiesInSphere(entity.pos, entity.radius, 0.72, 'anemo', false, char);
      if (entity.absorbedElement) {
        this.damageEnemiesInSphere(entity.pos, entity.radius, 0.45, entity.absorbedElement, false, char);
      }
    } else if (entity.kind === 'phoenix') {
      this.damageEnemiesInSphere(entity.pos, entity.radius, 1.38, 'pyro', true, char);
    } else if (entity.kind === 'mona_phantom') {
      this.activeTauntPos = entity.pos;
      this.damageEnemiesInSphere(entity.pos, entity.radius, 0.68, 'hydro', false, char);
    } else if (entity.kind === 'ayaka_storm') {
      this.damageEnemiesInSphere(entity.pos, entity.radius, 1.05, 'cryo', false, char);
    } else if (entity.kind === 'zhongli_stele') {
      this.damageEnemiesInSphere(entity.pos, entity.radius, 0.72, 'geo', false, char);
    } else if (entity.kind === 'zhongli_meteor') {
      this.player.triggerCameraShake(0.45, 0.4);
      this.sound.playHit('geo', true);
      this.enemies.petrifyEnemiesInRadius(entity.pos, entity.radius, 4.5);
      this.damageEnemiesInSphere(entity.pos, entity.radius, 5.2, 'geo', true, char);
      this.callbacks.onReactionDisplay(
        entity.pos.clone().add(new THREE.Vector3(0, 2.4, 0)),
        '석화! (4.5s)',
        '#f5cf64',
      );
    }
  }

  public handleSkillEntityEnd(entity: ActiveSkillEntity): void {
    if (entity.kind === 'mona_phantom') {
      this.activeTauntPos = null;
      this.vfx.spawnShockwave(entity.pos, 'hydro', 5.2, 0.45);
      this.damageEnemiesInSphere(entity.pos, 5.2, 1.85, 'hydro', false, this.progression.party.mona);
    }
  }

  private orientTowardNearestEnemy(): THREE.Vector3 {
    const near = this.enemies.findNearestEnemy(this.player.position, 9.5);
    if (near) {
      const dx = near.pos.x - this.player.position.x;
      const dz = near.pos.z - this.player.position.z;
      this.player.facingAngle = Math.atan2(dx, dz);
    }
    return this.player.getForwardDirection();
  }

  private performNormalAttack(char: CharacterRuntime): void {
    const def = CHARACTERS[char.id];
    const dir = this.orientTowardNearestEnemy();

    this.comboStep = (this.comboStep % 4) + 1;
    this.comboResetTimer = 1.25;
    this.attackCooldown = def.weaponType === 'claymore' ? 0.36 : def.weaponType === 'polearm' ? 0.2 : 0.23;

    this.player.activeRig?.triggerAttackSwing(this.comboStep);
    this.sound.playSwing(def.weaponType, this.comboStep);

    // Subtle Genshin forward combat lunge
    this.player.velocity.addScaledVector(dir, 2.2);

    const elem: ElementType =
      def.weaponType === 'catalyst'
        ? def.element
        : char.infusionTimer > 0 && char.infusionElement
          ? char.infusionElement
          : 'physical';

    if (def.weaponType === 'catalyst') {
      const start = this.player.position.clone().add(new THREE.Vector3(0, 1.25, 0)).addScaledVector(dir, 0.6);
      this.vfx.spawnProjectile(start, dir, 23, def.element, 15);
      const targetPos = this.player.position.clone().addScaledVector(dir, 5.5);
      this.interactables.tryHitMonument(targetPos, 3.8, def.element, this.callbacks.onMonumentLit);
      const targetEnemy = this.enemies.findNearestEnemy(targetPos, 8.0);
      if (targetEnemy) {
        this.hitSingleEnemy(targetEnemy, 0.92 + this.comboStep * 0.14, elem, false, char);
      }
      return;
    }

    const reach = def.weaponType === 'claymore' ? 3.6 : def.weaponType === 'polearm' ? 3.5 : 3.0;
    const hitCenter = this.player.position.clone().addScaledVector(dir, 1.45);
    this.vfx.spawnSlashArc(this.player.position, this.player.facingAngle, this.comboStep, elem, reach * 0.88);
    if (elem !== 'physical') {
      this.interactables.tryHitMonument(hitCenter, reach, elem, this.callbacks.onMonumentLit);
    }
    this.interactables.damageCrystalNear(hitCenter, reach, 55, (ore) => {
      this.progression.addItem('crystal_ore', '수정 덩이', 2);
      this.progression.addMora(250);
      this.vfx.spawnHitBurst(new THREE.Vector3(ore.x, ore.y + 0.5, ore.z), 'anemo', 10);
      this.sound.playPickup();
    });

    const mult = (def.weaponType === 'claymore' ? 1.18 : 0.88) + this.comboStep * 0.16;
    this.damageEnemiesInSphere(hitCenter, reach, mult, elem, def.weaponType === 'claymore', char);
  }

  private performChargedAttack(char: CharacterRuntime): void {
    const def = CHARACTERS[char.id];
    if (this.player.stamina < 24) return;
    this.player.stamina -= 24;

    const dir = this.orientTowardNearestEnemy();
    this.attackCooldown = 0.44;
    this.player.activeRig?.triggerAttackSwing(4);
    this.sound.playSwing(def.weaponType, 4);

    const elem: ElementType =
      def.weaponType === 'catalyst'
        ? def.element
        : char.infusionTimer > 0 && char.infusionElement
          ? char.infusionElement
          : 'physical';

    if (def.weaponType === 'catalyst') {
      const targetPos = this.player.position.clone().addScaledVector(dir, 5.2);
      const near = this.enemies.findNearestEnemy(targetPos, 8);
      const hitPos = near ? near.pos.clone() : targetPos;
      this.vfx.spawnShockwave(hitPos, 'hydro', 4.4, 0.4);
      this.interactables.tryHitMonument(hitPos, 4.4, 'hydro', this.callbacks.onMonumentLit);
      this.damageEnemiesInSphere(hitPos, 4.4, 2.0, 'hydro', false, char);
    } else {
      const center = this.player.position.clone().addScaledVector(dir, 1.8);
      this.player.velocity.addScaledVector(dir, def.weaponType === 'polearm' ? 9.0 : 4.2);
      this.vfx.spawnSlashArc(this.player.position, this.player.facingAngle, 2, elem, 3.8);
      this.vfx.spawnShockwave(center, elem === 'physical' ? def.element : elem, 3.8, 0.34);
      if (elem !== 'physical') this.interactables.tryHitMonument(center, 3.8, elem, this.callbacks.onMonumentLit);
      this.damageEnemiesInSphere(center, 3.8, 1.95, elem, true, char);
    }
  }

  private tryCastSkill(char: CharacterRuntime): void {
    const def = CHARACTERS[char.id];
    if (char.id === 'diluc' && this.dilucSkillCharges > 0 && this.dilucWindowTimer > 0) {
      this.dilucSkillCharges--;
      this.castDilucSkillSlash(char);
      return;
    }
    if (char.skillCd > 0) return;

    char.skillCd = def.skillCooldown;
    const dir = this.orientTowardNearestEnemy();
    this.player.activeRig?.triggerUnsheathe();
    this.player.animStateOverride = 'skill';
    this.player.animOverrideTimer = 0.36;
    this.sound.playSkill(def.element);

    if (char.id === 'traveler') {
      const center = this.player.position.clone().addScaledVector(dir, 2.5);
      this.vfx.spawnShockwave(center, 'anemo', 6.0, 0.5);
      this.interactables.tryHitMonument(center, 6.0, 'anemo', this.callbacks.onMonumentLit);
      for (const e of this.enemies.enemies) {
        if (e.alive && !e.isBoss && e.pos.distanceTo(center) < 7.8) {
          const pull = center.clone().sub(e.pos).setY(0).normalize();
          e.pos.addScaledVector(pull, 2.4);
        }
      }
      this.damageEnemiesInSphere(center, 6.0, 2.65, 'anemo', false, char);
      this.vfx.spawnEnergyOrbs(center, 'anemo', 3, 5);
    } else if (char.id === 'diluc') {
      this.dilucSkillCharges = 2;
      this.dilucWindowTimer = 4.5;
      this.castDilucSkillSlash(char);
    } else if (char.id === 'mona') {
      const pos = this.player.position.clone().addScaledVector(dir, 3.5);
      this.vfx.spawnMonaPhantom(pos);
      this.activeTauntPos = pos;
      this.interactables.tryHitMonument(pos, 5.0, 'hydro', this.callbacks.onMonumentLit);
      this.vfx.spawnEnergyOrbs(pos, 'hydro', 3, 5);
    } else if (char.id === 'keqing') {
      const near = this.enemies.findNearestEnemy(this.player.position, 12);
      const startPos = this.player.position.clone().add(new THREE.Vector3(0, 1.1, 0));
      let dest = this.player.position.clone().addScaledVector(dir, 7.5);
      if (near) dest = near.pos.clone().addScaledVector(dir, -1.6);
      this.vfx.spawnLightningArc(startPos, dest.clone().add(new THREE.Vector3(0, 1.1, 0)), 0xd082ff, 0.38);
      this.player.teleport(dest.x, dest.z, 0.1);
      this.vfx.spawnShockwave(dest, 'electro', 4.8, 0.42);
      this.interactables.tryHitMonument(dest, 5.2, 'electro', this.callbacks.onMonumentLit);
      char.infusionTimer = 6.0;
      char.infusionElement = 'electro';
      this.damageEnemiesInSphere(dest, 4.8, 2.6, 'electro', false, char);
      this.vfx.spawnEnergyOrbs(dest, 'electro', 3, 5);
    } else if (char.id === 'ayaka') {
      const center = this.player.position.clone();
      this.vfx.spawnAyakaFrostLotus(center);
      this.interactables.tryHitMonument(center, 5.5, 'cryo', this.callbacks.onMonumentLit);
      char.infusionTimer = 6.0;
      char.infusionElement = 'cryo';
      this.damageEnemiesInSphere(center, 5.4, 2.75, 'cryo', false, char);
      this.vfx.spawnEnergyOrbs(center, 'cryo', 3, 5);
    } else if (char.id === 'zhongli') {
      const pos = this.player.position.clone().addScaledVector(dir, 2.6);
      this.vfx.spawnZhongliStele(pos);
      this.vfx.spawnShockwave(this.player.position, 'geo', 6.0, 0.5);
      this.interactables.tryHitMonument(pos, 6.0, 'geo', this.callbacks.onMonumentLit);
      // Iconic Zhongli Jade Shield (6,500 HP for 16s!)
      this.progression.applyShield(6500, 'geo', 16.0);
      this.damageEnemiesInSphere(pos, 6.0, 2.1, 'geo', true, char);
      this.vfx.spawnEnergyOrbs(pos, 'geo', 3, 5);
    }
  }

  private castDilucSkillSlash(char: CharacterRuntime): void {
    const dir = this.orientTowardNearestEnemy();
    this.player.velocity.addScaledVector(dir, 6.5);
    this.player.activeRig?.triggerAttackSwing(3 - this.dilucSkillCharges);
    this.sound.playSkill('pyro');
    const center = this.player.position.clone().addScaledVector(dir, 2.0);
    this.vfx.spawnSlashArc(this.player.position, this.player.facingAngle, 3 - this.dilucSkillCharges, 'pyro', 4.1);
    this.vfx.spawnShockwave(center, 'pyro', 4.2, 0.35);
    this.interactables.tryHitMonument(center, 4.5, 'pyro', this.callbacks.onMonumentLit);
    this.damageEnemiesInSphere(center, 4.4, 2.1, 'pyro', true, char);
    this.vfx.spawnEnergyOrbs(center, 'pyro', 2, 4);
  }

  private tryCastBurst(char: CharacterRuntime): void {
    const def = CHARACTERS[char.id];
    if (char.burstCd > 0 || char.energy < char.maxEnergy) return;

    char.energy = 0;
    char.burstCd = def.burstCooldown;
    this.player.iframeTimer = 1.5;
    this.player.triggerBurstCamera(0.95);
    this.player.triggerCameraShake(0.32, 0.28);
    this.player.activeRig?.triggerUnsheathe();
    this.player.animStateOverride = 'burst';
    this.player.animOverrideTimer = 0.65;

    this.callbacks.onBurstCutIn(char.id);
    const dir = this.orientTowardNearestEnemy();
    this.sound.playBurst(def.element);

    if (char.id === 'traveler') {
      const start = this.player.position.clone().addScaledVector(dir, 2.2);
      this.vfx.spawnTravelerTornado(start, dir);
      this.vfx.spawnShockwave(start, 'anemo', 5.4, 0.48);
    } else if (char.id === 'diluc') {
      const start = this.player.position.clone().addScaledVector(dir, 1.6);
      this.vfx.spawnDilucPhoenix(start, dir);
      char.infusionTimer = 8.0;
      char.infusionElement = 'pyro';
      this.vfx.spawnShockwave(start, 'pyro', 5.8, 0.48);
    } else if (char.id === 'mona') {
      const center = this.player.position.clone().addScaledVector(dir, 3.0);
      this.vfx.spawnMonaCosmicDome(center);
      for (const e of this.enemies.enemies) {
        if (e.alive && e.pos.distanceTo(center) <= 7.8) e.omenTimer = 6.5;
      }
      this.damageEnemiesInSphere(center, 7.8, 3.9, 'hydro', false, char);
    } else if (char.id === 'keqing') {
      const center = this.player.position.clone().addScaledVector(dir, 2.2);
      this.vfx.spawnKeqingSlashes(center);
      this.damageEnemiesInSphere(center, 7.2, 4.3, 'electro', false, char);
    } else if (char.id === 'ayaka') {
      const start = this.player.position.clone().addScaledVector(dir, 2.4);
      this.vfx.spawnAyakaFrostStorm(start, dir);
      this.vfx.spawnShockwave(start, 'cryo', 5.6, 0.5);
    } else if (char.id === 'zhongli') {
      const near = this.enemies.findNearestEnemy(this.player.position, 14);
      const target = near ? near.pos.clone() : this.player.position.clone().addScaledVector(dir, 6.5);
      this.vfx.spawnZhongliMeteor(target);
      this.interactables.tryHitMonument(target, 8.5, 'geo', this.callbacks.onMonumentLit);
    }
  }

  private damageEnemiesInSphere(
    center: THREE.Vector3,
    radius: number,
    multiplier: number,
    element: ElementType,
    isHeavyBlunt: boolean,
    char: CharacterRuntime,
  ): void {
    for (const e of this.enemies.enemies) {
      if (!e.alive) continue;
      if (e.pos.distanceTo(center) <= radius + e.radius) {
        this.hitSingleEnemy(e, multiplier, element, isHeavyBlunt, char, center);
      }
    }
  }

  private hitSingleEnemy(
    enemy: EnemyUnit,
    multiplier: number,
    element: ElementType,
    isHeavyBlunt: boolean,
    char: CharacterRuntime,
    sourcePos?: THREE.Vector3,
  ): void {
    const stats = this.progression.getComputedStats(char.id);
    const elemMult = element !== 'physical' ? 1 + stats.elemDmgBonus : 1;
    const rawDamage = stats.atk * multiplier * elemMult;

    const kbDir = sourcePos
      ? enemy.pos.clone().sub(sourcePos).setY(0).normalize()
      : this.player.getForwardDirection();

    this.enemies.applyDamage({
      enemy,
      rawDamage,
      element,
      critRate: stats.critRate,
      critDmg: stats.critDmg,
      isHeavyBlunt,
      knockbackDir: kbDir,
      knockbackForce: isHeavyBlunt ? 4.5 : 1.8,
      onEnemyKilled: (killed) => this.callbacks.onEnemyDefeated(killed),
      onReactionFeedback: (fb: HitFeedback) => {
        this.sound.playHit(element, fb.outcome.isCrit);
        this.callbacks.onDamageDisplay(fb.worldHitPos, fb.outcome.finalDamage, element, fb.outcome.isCrit);
        if (fb.shieldBroken) {
          this.callbacks.onReactionDisplay(fb.worldHitPos.clone().add(new THREE.Vector3(0, 0.9, 0)), '보호막 파괴!', '#ffdf78');
        }
        if (fb.outcome.grantCrystallizeShield) {
          this.progression.applyShield(3200, fb.outcome.grantCrystallizeShield, 12.0);
        }
        if (fb.outcome.reaction && fb.outcome.reactionLabelKr && fb.outcome.reactionColorCss) {
          this.sound.playReaction(fb.outcome.reaction);
          this.callbacks.onReactionDisplay(
            fb.worldHitPos.clone().add(new THREE.Vector3(0, 0.55, 0)),
            fb.outcome.reactionLabelKr,
            fb.outcome.reactionColorCss,
          );
        } else if (fb.outcome.reactionLabelKr && fb.outcome.reactionColorCss) {
          this.callbacks.onReactionDisplay(
            fb.worldHitPos.clone().add(new THREE.Vector3(0, 0.55, 0)),
            fb.outcome.reactionLabelKr,
            fb.outcome.reactionColorCss,
          );
        }
        if (fb.outcome.isCrit) {
          this.player.triggerCameraShake(0.11, 0.09);
        }
      },
    });
  }
}
