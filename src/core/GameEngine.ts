import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { SoundEngine } from '../audio/SoundEngine';
import { ALL_CHARACTERS, CHARACTERS, WEAPONS } from '../characters/CharacterData';
import { CharacterRig } from '../characters/CharacterRig';
import { PlayerController } from '../characters/PlayerController';
import { CombatController } from '../combat/CombatController';
import { EnemySystem } from '../combat/EnemySystem';
import { VFXSystem } from '../combat/VFXSystem';
import { warmPortraitCache } from '../systems/PortraitGenerator';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { CharacterMenu } from '../ui/CharacterMenu';
import { ControlsOverlay } from '../ui/ControlsOverlay';
import { HUD } from '../ui/HUD';
import { detectTouchDevice, MobileControls } from '../ui/MobileControls';
import { TitleScreen } from '../ui/TitleScreen';
import { WishSystem } from '../ui/WishSystem';
import { WorldMap } from '../ui/WorldMap';
import { FoliageSystem } from '../world/FoliageSystem';
import { DOMAIN_GATE_POS, Landmarks } from '../world/Landmarks';
import { SkySystem } from '../world/SkySystem';
import { Terrain, WORLD_LANDMARKS } from '../world/Terrain';
import { WaterSystem } from '../world/WaterSystem';
import { WorldInteractables } from '../world/WorldInteractables';
import { InputManager } from './InputManager';
import type { CharacterId, GraphicsQuality, ModalPanel } from './Types';

export class GameEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;

  private readonly input: InputManager;
  private readonly sound: SoundEngine;
  private readonly progression: ProgressionSystem;

  private readonly terrain: Terrain;
  private readonly sky: SkySystem;
  private readonly water: WaterSystem;
  private readonly foliage: FoliageSystem;
  private readonly landmarks: Landmarks;
  private readonly interactables: WorldInteractables;

  private readonly player: PlayerController;
  private readonly characterRigs = {} as Record<CharacterId, CharacterRig>;
  private readonly vfx: VFXSystem;
  private readonly enemies: EnemySystem;
  private readonly combat: CombatController;

  private readonly hud: HUD;
  private readonly mobileControls: MobileControls;
  private readonly worldMap: WorldMap;
  private readonly wishSystem: WishSystem;
  private readonly characterMenu: CharacterMenu;
  private readonly controlsOverlay: ControlsOverlay;
  private readonly warpFade: HTMLElement;

  private gameStarted = false;
  private activeModal: ModalPanel = 'none';
  private lastTime = performance.now();
  private titleOrbitAngle = 0.65;
  private swapCooldown = 0;

  constructor(container: HTMLElement) {
    warmPortraitCache();

    // 1. Renderer & Post-Processing (preserveDrawingBuffer for crisp Photo Mode PNG capture)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'webgl-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.2, 550);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.34,
      0.42,
      0.88,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // 2. Core & Audio
    this.input = new InputManager(this.renderer.domElement);
    this.sound = new SoundEngine();
    this.progression = new ProgressionSystem();

    // 3. World Systems
    this.terrain = new Terrain();
    this.scene.add(this.terrain.mesh);

    this.sky = new SkySystem(this.scene);
    this.sky.setTimeOfDay(17.2);
    this.water = new WaterSystem(this.scene);
    this.foliage = new FoliageSystem(this.scene);
    this.landmarks = new Landmarks(this.scene);
    this.interactables = new WorldInteractables(this.scene);
    this.interactables.syncFromSave({
      statueResonated: this.progression.statueResonated,
      unlockedWaypoints: Array.from(this.progression.unlockedWaypoints),
      collectedAnemoculi: Array.from(this.progression.collectedAnemoculi),
      openedChests: Array.from(this.progression.openedChests),
      completedSeelies: Array.from(this.progression.completedSeelies),
      completedPuzzles: Array.from(this.progression.completedPuzzles),
      completedChallenges: Array.from(this.progression.completedChallenges),
    });

    // 4. Characters & Player (all 6 rigs ready for instant party swaps!)
    this.player = new PlayerController(this.camera, this.sound);
    this.player.maxStamina = 240 + this.progression.collectedAnemoculi.size * 12;
    this.player.stamina = this.player.maxStamina;

    for (const id of ALL_CHARACTERS) {
      const rig = new CharacterRig(CHARACTERS[id], this.progression.party[id].weaponId);
      rig.root.visible = id === this.progression.activeCharacterId;
      this.scene.add(rig.root);
      this.characterRigs[id] = rig;
    }
    this.player.activeRig = this.characterRigs[this.progression.activeCharacterId];

    // 5. Combat, VFX & Enemies
    this.vfx = new VFXSystem(this.scene);
    this.enemies = new EnemySystem(this.scene, this.vfx);

    this.enemies.onDomainWaveChanged = (wave) => {
      this.sound.playWaypointUnlock();
      this.hud.showToast(`비경 시련 · 웨이브 ${wave}/3 시작!`, '모든 적을 처치하세요.');
    };
    this.enemies.onDomainCleared = () => {
      this.progression.markDomainCleared();
      this.sound.playChestOpen();
      this.vfx.spawnHealingBeam(this.player.position, 0xffd45c);
      this.hud.showToast('비경 시련 클리어!!', '원석 +240 · 모라 +25,000 · ★5 선도장 획득!');
    };
    this.enemies.onDomainFailed = () => {
      this.hud.showToast('비경 시련 시간 초과', '다시 도전할 수 있습니다.');
    };

    this.combat = new CombatController(
      this.player,
      this.enemies,
      this.vfx,
      this.interactables,
      this.progression,
      this.sound,
      {
        onDamageDisplay: (pos, amount, elem, isCrit) => {
          this.hud.spawnDamageNumber(pos, amount, elem, isCrit);
        },
        onReactionDisplay: (pos, label, colorCss) => {
          this.hud.spawnReactionPopup(pos, label, colorCss);
        },
        onBurstCutIn: (charId) => {
          this.hud.showBurstCutIn(charId);
        },
        onMonumentLit: (mon, solved) => {
          this.sound.playSeelieChime();
          this.vfx.spawnHitBurst(new THREE.Vector3(mon.x, mon.y + 2.6, mon.z), mon.element, 14);
          if (solved) {
            this.progression.markSeelieOrPuzzleCompleted(mon.puzzleId, false);
            this.sound.playChestOpen();
            this.hud.showToast('원소 비석 퍼즐 완료!', '숨겨진 진귀한 보물상자가 나타났습니다! (+80 원석)');
          } else {
            this.hud.pushLootNotice('원소 비석 활성화!', '#ffd45c');
          }
        },
        onEnemyDefeated: (enemy) => {
          this.progression.addMora(enemy.isBoss ? 12000 : 450);
          const leveled = this.progression.addExp(enemy.isBoss ? 500 : 45);
          if (enemy.isBoss && !enemy.isDomainEnemy) {
            this.progression.markBossDefeated();
            this.hud.showToast('유적 가디언 처치 완료!', '속삭임의 유적 화려한 보물상자의 봉인이 해제되었습니다.');
          }
          if (leveled) {
            this.hud.showToast(`모험 등급 상승!`, `모험 등급 Lv.${this.progression.adventureRank} 달성 (+160 원석)`);
          }
        },
      },
    );

    this.player.onFallDamage = (dmg) => {
      const res = this.progression.damageActiveCharacter(dmg);
      if (res.switchedTo) this.applyActiveRig(res.switchedTo);
      else if (res.died) this.reviveAtStatue();
    };
    this.player.onWaterRipple = (x, y, z, fast) => {
      this.vfx.spawnWaterRipple(x, y, z, fast ? 1.45 : 1.0);
    };
    this.player.onDrown = () => {
      const active = this.progression.getActiveCharacter();
      this.progression.damageActiveCharacter(Math.round(active.maxHp * 0.1));
      this.player.stamina = this.player.maxStamina * 0.45;
      this.player.teleport(this.player.lastDryPos.x, this.player.lastDryPos.z, 0.3);
      this.hud.showToast('스태미나 부족!', '안전한 육지로 복귀했습니다.');
    };

    // 6. UI Layers
    this.warpFade = document.createElement('div');
    this.warpFade.className = 'warp-fade';
    container.appendChild(this.warpFade);

    this.hud = new HUD(
      container,
      this.progression,
      (panel) => this.openModal(panel),
      (id) => this.switchPartyMember(id),
      () => this.combat.triggerSkill(),
      () => this.combat.triggerBurst(),
    );
    this.hud.setVisible(false);

    this.mobileControls = new MobileControls(
      container,
      this.input,
      () => this.triggerElementalSight(),
      () => this.useQuickHeal(),
    );
    if (detectTouchDevice()) {
      this.applyQuality('low');
    }

    this.progression.onQuestCompleted = (q) => {
      this.hud.showToast(`임무 완료: ${q.titleKr}`, `보상 획득: 원석 +${q.rewardPrimogems}`);
      this.sound.playChestOpen();
    };

    this.worldMap = new WorldMap(
      container,
      this.hud.minimap.baseMapCanvas,
      this.progression,
      this.interactables,
      (x, z, label) => this.fastTravel(x, z, label),
      () => this.closeModal(),
    );

    this.wishSystem = new WishSystem(container, this.progression, this.sound, () => this.closeModal());

    this.characterMenu = new CharacterMenu(container, this.progression, this.sound, {
      onWeaponEquipped: (cid) => {
        const w = WEAPONS[this.progression.party[cid].weaponId];
        if (w) this.characterRigs[cid].equipWeapon(w);
      },
      onPartyChanged: () => {
        this.hud.rebuildPartyList();
        this.applyActiveRig(this.progression.activeCharacterId);
      },
      onTimeChanged: (h) => {
        this.sky.setTimeOfDay(h);
        this.sound.setTimeMode(h);
      },
      onQualityChanged: (q) => this.applyQuality(q),
      onToggleTouchControls: () => {
        const next = !this.mobileControls.isEnabled();
        this.mobileControls.setEnabled(next);
        return next;
      },
      isTouchControlsEnabled: () => this.mobileControls.isEnabled(),
      onStartDomain: () => {
        this.player.teleport(DOMAIN_GATE_POS.x - 10, DOMAIN_GATE_POS.z + 10, 0.4);
        this.enemies.startDomainTrial();
      },
      onCapturePhoto: () => this.capturePhotoPng(),
      onClose: () => this.closeModal(),
      onNotify: (msg) => this.hud.pushLootNotice(msg),
    });

    this.controlsOverlay = new ControlsOverlay(container, () => this.closeModal());

    new TitleScreen(container, () => {
      this.gameStarted = true;
      this.sky.setTimeOfDay(10.8);
      this.sound.setTimeMode(10.8);
      this.sound.unlock();
      this.hud.setVisible(true);
      this.mobileControls.setGameplayVisible(true);
      this.input.setGameplayActive(true);
      this.input.requestLock();
      this.hud.showToast(
        '티바트에 오신 것을 환영합니다!',
        this.mobileControls.isEnabled()
          ? '좌측 조이스틱 이동 · 화면 드래그 시점 회전 · 우측 버튼 전투!'
          : '앞쪽 일곱신상 공명(F) · 원소 시야(V) · 파티 편성(L · 6인) · 기원(F3)',
      );
    });

    window.addEventListener('resize', () => this.onResize());
    (window as unknown as { __getGameState?: () => Record<string, unknown> }).__getGameState = () => {
      const camForward = new THREE.Vector3();
      this.camera.getWorldDirection(camForward);
      const camRight = new THREE.Vector3().crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();
      return {
        started: this.gameStarted,
        modal: this.activeModal,
        x: Number(this.player.position.x.toFixed(3)),
        y: Number(this.player.position.y.toFixed(3)),
        z: Number(this.player.position.z.toFixed(3)),
        facingAngle: Number(this.player.facingAngle.toFixed(3)),
        cameraYaw: Number(this.player.cameraYaw.toFixed(3)),
        cameraPitch: Number(this.player.cameraPitch.toFixed(3)),
        camForward: [Number(camForward.x.toFixed(3)), Number(camForward.z.toFixed(3))],
        camRight: [Number(camRight.x.toFixed(3)), Number(camRight.z.toFixed(3))],
        grounded: this.player.grounded,
        gliding: this.player.gliding,
        climbing: this.player.climbing,
        swimming: this.player.swimming,
        stamina: Number(this.player.stamina.toFixed(1)),
        activeChar: this.progression.activeCharacterId,
        shieldHp: this.progression.shield?.hp ?? 0,
      };
    };
    requestAnimationFrame((t) => this.loop(t));
  }

  private capturePhotoPng(): void {
    this.composer.render();
    try {
      const url = this.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `teyvat_snapshot_${Date.now()}.png`;
      a.click();
      this.sound.playPickup();
    } catch {
      // Ignore download restrictions
    }
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }

  private applyQuality(q: GraphicsQuality): void {
    this.foliage.setQuality(q);
    if (q === 'low') {
      this.renderer.setPixelRatio(1);
      this.bloomPass.strength = 0.16;
    } else if (q === 'high') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.bloomPass.strength = 0.34;
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.bloomPass.strength = 0.44;
    }
    this.onResize();
  }

  private switchPartyMember(id: CharacterId): void {
    if (this.swapCooldown > 0) return;
    if (this.progression.switchCharacter(id)) {
      this.swapCooldown = 0.45;
      this.applyActiveRig(id);
      this.combat.clearTransientInput();
      this.sound.playCharacterSwap();
      this.vfx.spawnHitBurst(
        this.player.position.clone().add(new THREE.Vector3(0, 1.0, 0)),
        CHARACTERS[id].element,
        10,
      );
    }
  }

  private applyActiveRig(id: CharacterId): void {
    for (const cid of ALL_CHARACTERS) {
      this.characterRigs[cid].root.visible = cid === id;
      this.characterRigs[cid].setAltSprintVisual('none');
    }
    this.player.altSprintActive = 'none';
    this.player.activeRig = this.characterRigs[id];
    this.player.activeRig.root.position.copy(this.player.position);
    this.player.activeRig.root.rotation.y = this.player.facingAngle;
  }

  private openModal(panel: ModalPanel): void {
    if (!this.gameStarted) return;
    if (panel === 'none' || this.activeModal === panel) {
      this.closeModal();
      return;
    }
    this.closeAllModals();
    this.activeModal = panel;
    this.mobileControls.setGameplayVisible(false);
    this.input.setGameplayActive(false);
    this.combat.clearTransientInput();

    if (panel === 'photo') {
      this.hud.setVisible(false);
      this.characterMenu.open('photo', this.sky.timeOfDay);
    } else if (panel === 'map') {
      this.worldMap.open(this.player.position.x, this.player.position.z);
    } else if (panel === 'wish') {
      this.wishSystem.open();
    } else if (panel === 'controls') {
      this.controlsOverlay.open();
    } else {
      this.characterMenu.open(panel, this.sky.timeOfDay);
    }
  }

  private closeAllModals(): void {
    this.worldMap.close();
    this.wishSystem.close();
    this.characterMenu.close();
    this.controlsOverlay.close();
  }

  private closeModal(): void {
    this.closeAllModals();
    this.activeModal = 'none';
    this.hud.setVisible(true);
    this.mobileControls.setGameplayVisible(true);
    this.input.setGameplayActive(true);
    this.input.requestLock();
  }

  private useQuickHeal(): void {
    const foodId =
      (this.progression.inventory.delicious_madame?.count ?? 0) > 0
        ? 'delicious_madame'
        : 'sweet_madame';
    const res = this.progression.consumeFood(foodId);
    if (res.healed > 0) {
      this.sound.playPickup();
      this.hud.pushLootNotice(`${this.progression.inventory[foodId].nameKr} 사용: HP +${res.healed}`, '#8bf27e');
    } else {
      this.hud.pushLootNotice('스튜가 부족합니다. [B] 배낭/모닥불에서 요리하거나 신상에서 회복하세요.', '#ff8b8b');
    }
  }

  private fastTravel(x: number, z: number, label: string): void {
    this.warpFade.classList.add('active');
    this.sound.playWaypointUnlock();
    setTimeout(() => {
      this.player.teleport(x, z, 0.5);
      this.warpFade.classList.remove('active');
      this.hud.showToast(`이동 완료 · ${label}`);
    }, 340);
  }

  private reviveAtStatue(): void {
    this.progression.healPartyFull();
    this.applyActiveRig(this.progression.activeCharacterId);
    this.fastTravel(WORLD_LANDMARKS.statue.x, WORLD_LANDMARKS.statue.z + 6, '일곱신상의 은총으로 부활');
  }

  private triggerElementalSight(): void {
    this.sound.playElementalSight();
    this.vfx.spawnElementalSightPulse(this.player.position);
    this.interactables.triggerElementalSight(this.player.position);
    this.hud.flashElementalSight();
    this.hud.pushLootNotice('원소 시야 발동: 주변 보물상자 · 눈동자 · 선령 · 원소 비석 탐지!', '#80ecff');
  }

  private loop(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    if (this.swapCooldown > 0) this.swapCooldown -= dt;

    this.input.update(dt);
    this.sound.update(dt);

    if (!this.gameStarted) {
      this.titleOrbitAngle += dt * 0.07;
      const r = 46;
      const camX = Math.cos(this.titleOrbitAngle) * r;
      const camZ = -18 + Math.sin(this.titleOrbitAngle) * r;
      this.camera.position.set(camX, 24 + Math.sin(this.titleOrbitAngle * 1.5) * 4, camZ);
      this.camera.lookAt(12, 7.5, -34);

      this.sky.update(dt, new THREE.Vector3(0, 6, -24), this.camera.position, false);
      this.water.update(dt, this.sky.sunDirection, this.sky.sunColor, this.sky.fog.color, this.sky.fog.density);
      this.foliage.update(dt, new THREE.Vector3(0, 6, 28), this.sky.sunColor, this.sky.fog.color, this.sky.fog.density);
      this.landmarks.update(dt, this.sky.timeOfDay);
    } else {
      this.handleModalAndQuickHotkeys();

      if (this.activeModal === 'none') {
        this.progression.tickBuffs(dt);
        this.player.activeRig?.setShieldVisual(this.progression.shield?.element ?? null);

        // Combine ALL solid static + dynamic world colliders (trees, boulders, landmarks, interactables, Zhongli stele, enemies)
        const dynamicCylinders = [
          ...this.foliage.colliders,
          ...this.landmarks.colliders,
          ...this.interactables.getDynamicColliders(),
        ];
        for (const ent of this.vfx.activeEntities) {
          if (ent.kind === 'zhongli_stele') {
            dynamicCylinders.push({
              x: ent.pos.x,
              z: ent.pos.z,
              radius: 0.58,
              minY: ent.pos.y - 0.5,
              maxY: ent.pos.y + 5.2,
              walkableTop: true,
            });
          }
        }
        for (const en of this.enemies.enemies) {
          if (!en.alive) continue;
          dynamicCylinders.push({
            x: en.pos.x,
            z: en.pos.z,
            radius: en.radius * 0.82,
            minY: en.pos.y - 0.5,
            maxY: en.pos.y + en.height,
          });
        }

        this.player.update(
          dt,
          this.input,
          { cylinders: dynamicCylinders, boxes: this.landmarks.boxColliders },
          this.landmarks.updrafts,
        );
        this.combat.update(dt, this.input);

        const activeCamps = this.enemies.getActiveCampIds();
        const prompts = this.interactables.update(dt, this.player.position, activeCamps, {
          onResonateStatue: () => {
            this.progression.markStatueResonated();
            this.player.stamina = this.player.maxStamina;
            this.vfx.spawnHealingBeam(this.interactables.statuePos, 0x62ffcf);
            this.sound.playStatueResonate();
            this.hud.showToast('바람의 일곱신상 공명!', '파티 HP & 스태미나 완전 회복');
          },
          onUnlockWaypoint: (wp) => {
            this.progression.markWaypointUnlocked(wp.id);
            this.vfx.spawnHealingBeam(new THREE.Vector3(wp.x, wp.y, wp.z), 0x5ce4ff);
            this.sound.playWaypointUnlock();
            this.hud.showToast(`워프 포인트 활성화`, `${wp.nameKr} (+60 원석)`);
          },
          onCollectAnemoculus: (oc) => {
            this.progression.markAnemoculusCollected(oc.id);
            this.player.maxStamina += 12;
            this.player.stamina = this.player.maxStamina;
            this.vfx.spawnHitBurst(new THREE.Vector3(oc.x, oc.y, oc.z), 'anemo', 14);
            this.sound.playAnemoculus();
            this.hud.pushLootNotice(
              `바람 신의 눈동자 획득 (${this.progression.collectedAnemoculi.size}/10) · 최대 스태미나 +12`,
              '#62ffcf',
            );
          },
          onOpenChest: (ch) => {
            const reward = this.progression.markChestOpened(ch.id, ch.tier);
            this.vfx.spawnHitBurst(new THREE.Vector3(ch.x, ch.y + 0.8, ch.z), 'pyro', 16);
            this.sound.playChestOpen();
            this.hud.pushLootNotice(
              `${ch.nameKr}: 원석 +${reward.primo}, 모라 +${reward.mora.toLocaleString()}`,
              '#ffd56b',
            );
          },
          onPickupCollectible: (item) => {
            this.progression.addItem(item.kind, item.nameKr, 1);
            this.sound.playPickup();
            this.hud.pushLootNotice(`${item.nameKr} ×1 획득`, '#8bf27e');
          },
          onSeelieStep: () => {
            this.sound.playSeelieChime();
          },
          onSeelieComplete: (s) => {
            this.progression.markSeelieOrPuzzleCompleted(s.id, true);
            this.sound.playChestOpen();
            this.vfx.spawnHealingBeam(s.pos, 0x62ffcf);
            this.hud.showToast('선령 인도 완료!', '선령의 정원 옆에 보물상자가 나타났습니다! (+80 원석)');
          },
          onMonumentLit: () => {},
          onChallengeStart: (trial) => {
            this.sound.playWaypointUnlock();
            this.hud.showToast(`도전 시작: ${trial.nameKr}`, trial.descKr);
          },
          onChallengeComplete: (trial) => {
            this.progression.markChallengeCompleted(trial.id);
            this.sound.playChestOpen();
            this.hud.showToast('도전 성공!', '보상 획득: 원석 +120 · 모라 +8,000');
          },
          onChallengeFail: () => {
            this.hud.showToast('도전 실패', '제한 시간이 종료되었습니다. 다시 도전해보세요.');
          },
          onOpenCooking: () => this.openModal('cooking'),
          onOpenDomain: () => this.openModal('domain'),
          onPassiveStatueHeal: (hdt) => {
            for (const c of Object.values(this.progression.party)) {
              if (c.isAlive && c.hp < c.maxHp) {
                c.hp = Math.min(c.maxHp, c.hp + 950 * hdt);
              }
            }
          },
        });

        if (this.input.wasKeyPressed('KeyF') && prompts.length > 0) {
          prompts[0].action();
        }

        const { anyInCombat } = this.enemies.update(
          dt,
          this.player.position,
          this.combat.activeTauntPos,
          (dmg) => {
            if (this.player.iframeTimer > 0) return;
            const res = this.progression.damageActiveCharacter(dmg);
            if (res.absorbedByShield) {
              this.sound.playHit('geo', false);
              return;
            }
            this.sound.playHit('physical', false);
            this.player.triggerCameraShake(0.18, 0.14);
            if (res.switchedTo) this.applyActiveRig(res.switchedTo);
            else if (res.died) this.reviveAtStatue();
          },
          [...this.foliage.colliders, ...this.landmarks.colliders],
        );
        this.sound.setInCombat(anyInCombat);

        this.vfx.update(
          dt,
          this.player.position,
          (elem, amt) => this.progression.addEnergyAll(elem, amt),
          (entity) => this.combat.handleSkillEntityTick(entity),
          (entity) => this.combat.handleSkillEntityEnd(entity),
        );

        this.sky.update(dt, this.player.position, this.camera.position, true);
        this.sound.setTimeMode(this.sky.timeOfDay);
        this.water.update(dt, this.sky.sunDirection, this.sky.sunColor, this.sky.fog.color, this.sky.fog.density);
        this.foliage.update(dt, this.player.position, this.sky.sunColor, this.sky.fog.color, this.sky.fog.density);
        this.landmarks.update(dt, this.sky.timeOfDay);

        const activeChallenge = this.enemies.getDomainHUD() ?? this.interactables.getActiveChallengeHUD();
        this.hud.update({
          dt,
          camera: this.camera,
          playerPos: this.player.position,
          cameraYaw: this.player.cameraYaw,
          playerFacing: this.player.facingAngle,
          stamina: this.player.stamina,
          maxStamina: this.player.maxStamina,
          interactables: this.interactables,
          enemies: this.enemies.getSnapshots(),
          prompts,
          activeChallenge,
        });
      } else if (this.activeModal === 'photo') {
        // Keep sky/water/grass gracefully animating during Photo Mode!
        this.sky.update(dt, this.player.position, this.camera.position, false);
        this.water.update(dt, this.sky.sunDirection, this.sky.sunColor, this.sky.fog.color, this.sky.fog.density);
        this.foliage.update(dt, this.player.position, this.sky.sunColor, this.sky.fog.color, this.sky.fog.density);
        this.landmarks.update(dt, this.sky.timeOfDay);
      }
    }

    this.input.clearFrameDeltas();
    this.composer.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  private handleModalAndQuickHotkeys(): void {
    if (this.input.wasKeyPressed('Escape')) {
      if (this.activeModal !== 'none') this.closeModal();
      else this.openModal('menu');
      return;
    }

    if (this.input.wasKeyPressed('KeyM')) this.openModal('map');
    else if (this.input.wasKeyPressed('F3')) this.openModal('wish');
    else if (this.input.wasKeyPressed('KeyC')) this.openModal('character');
    else if (this.input.wasKeyPressed('KeyL')) this.openModal('party');
    else if (this.input.wasKeyPressed('KeyB')) this.openModal('bag');
    else if (this.input.wasKeyPressed('KeyT')) this.openModal('time');
    else if (this.input.wasKeyPressed('KeyP')) this.openModal('photo');
    else if (this.input.wasKeyPressed('F1')) this.openModal('controls');

    if (this.activeModal !== 'none') return;

    // Elemental Sight (V or Middle Mouse Button)
    if (this.input.wasKeyPressed('KeyV') || this.input.mouseMiddleJustPressed) {
      this.triggerElementalSight();
    }

    // Active Party Slots 1~4
    const party = this.progression.activeParty;
    if (this.input.wasKeyPressed('Digit1') && party[0]) this.switchPartyMember(party[0]);
    if (this.input.wasKeyPressed('Digit2') && party[1]) this.switchPartyMember(party[1]);
    if (this.input.wasKeyPressed('Digit3') && party[2]) this.switchPartyMember(party[2]);
    if (this.input.wasKeyPressed('Digit4') && party[3]) this.switchPartyMember(party[3]);

    // Quick heal with Sweet Madame (prefers Delicious first!)
    if (this.input.wasKeyPressed('KeyH')) {
      this.useQuickHeal();
    }
  }
}
