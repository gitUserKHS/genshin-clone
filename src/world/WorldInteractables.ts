import * as THREE from 'three';
import {
  ELEMENT_COLORS,
  type ActiveChallengeHUD,
  type CylinderCollider,
  type ElementType,
  type InteractablePrompt,
} from '../core/Types';
import { createToonGradientMap } from './FoliageSystem';
import { DOMAIN_GATE_POS } from './Landmarks';
import { getTerrainHeight, WATER_Y, WORLD_LANDMARKS } from './Terrain';

export interface WaypointNode {
  id: string;
  nameKr: string;
  x: number;
  y: number;
  z: number;
  unlocked: boolean;
  mesh: THREE.Group;
  crystal: THREE.Mesh;
  crystalMat: THREE.MeshStandardMaterial;
}

export interface AnemoculusNode {
  id: string;
  x: number;
  y: number;
  z: number;
  collected: boolean;
  mesh: THREE.Group;
}

export interface ChestNode {
  id: string;
  tier: 'common' | 'exquisite' | 'precious' | 'luxurious';
  nameKr: string;
  x: number;
  y: number;
  z: number;
  opened: boolean;
  hiddenUntilUnlocked?: boolean;
  lockedByCamp?: string;
  mesh: THREE.Group;
  lid: THREE.Group;
  barrierMesh?: THREE.Mesh;
}

export interface CollectibleNode {
  id: string;
  kind: 'sweet_flower' | 'windwheel' | 'sunsettia' | 'crystal_core';
  nameKr: string;
  x: number;
  y: number;
  z: number;
  collected: boolean;
  mesh: THREE.Group;
  respawnTimer: number;
  isButterfly?: boolean;
}

export interface CrystalOreNode {
  id: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  broken: boolean;
  mesh: THREE.Group;
  respawnTimer: number;
}

export interface SeelieNode {
  id: string;
  waypoints: Array<[number, number]>;
  currentIndex: number;
  pos: THREE.Vector3;
  completed: boolean;
  mesh: THREE.Group;
  courtMesh: THREE.Group;
  rewardChestId: string;
}

export interface MonumentNode {
  id: string;
  puzzleId: string;
  element: ElementType;
  x: number;
  y: number;
  z: number;
  lit: boolean;
  mesh: THREE.Group;
  orbMat: THREE.MeshStandardMaterial;
}

export interface TimeTrialNode {
  id: string;
  nameKr: string;
  descKr: string;
  x: number;
  y: number;
  z: number;
  completed: boolean;
  active: boolean;
  duration: number;
  timeLeft: number;
  orbCoords: Array<[number, number, number]>;
  orbMeshes: THREE.Mesh[];
  collectedCount: number;
  pillarMesh: THREE.Group;
}

export interface InteractCallbacks {
  onResonateStatue: () => void;
  onUnlockWaypoint: (wp: WaypointNode) => void;
  onCollectAnemoculus: (node: AnemoculusNode) => void;
  onOpenChest: (chest: ChestNode) => void;
  onPickupCollectible: (item: CollectibleNode) => void;
  onSeelieStep: () => void;
  onSeelieComplete: (seelie: SeelieNode) => void;
  onMonumentLit: (mon: MonumentNode, puzzleSolved: boolean) => void;
  onChallengeStart: (trial: TimeTrialNode) => void;
  onChallengeComplete: (trial: TimeTrialNode) => void;
  onChallengeFail: (trial: TimeTrialNode) => void;
  onOpenCooking: () => void;
  onOpenDomain: () => void;
  onPassiveStatueHeal: (dt: number) => void;
}

export class WorldInteractables {
  public statueResonated = false;
  public readonly statuePos: THREE.Vector3;
  public readonly waypoints: WaypointNode[] = [];
  public readonly anemoculi: AnemoculusNode[] = [];
  public readonly chests: ChestNode[] = [];
  public readonly collectibles: CollectibleNode[] = [];
  public readonly crystalOres: CrystalOreNode[] = [];
  public readonly seelies: SeelieNode[] = [];
  public readonly monuments: MonumentNode[] = [];
  public readonly trials: TimeTrialNode[] = [];
  public readonly cookingFires: Array<{ x: number; y: number; z: number }> = [
    { x: 10, y: getTerrainHeight(10, 22), z: 22 },
    { x: 74, y: getTerrainHeight(74, 48), z: 48 },
  ];

  private sightBeacons: THREE.Mesh[] = [];
  private sightTimer = 0;
  private elapsed = 0;

  constructor(private readonly scene: THREE.Scene) {
    const sy = getTerrainHeight(WORLD_LANDMARKS.statue.x, WORLD_LANDMARKS.statue.z);
    this.statuePos = new THREE.Vector3(WORLD_LANDMARKS.statue.x, sy, WORLD_LANDMARKS.statue.z);

    this.createWaypoints(scene);
    this.createAnemoculi(scene);
    this.createChests(scene);
    this.createCollectibles(scene);
    this.createCrystalOres(scene);
    this.createCookingCampfires(scene);
    this.createSeelies(scene);
    this.createElementalMonuments(scene);
    this.createTimeTrials(scene);
  }

  public syncFromSave(data: {
    statueResonated: boolean;
    unlockedWaypoints: string[];
    collectedAnemoculi: string[];
    openedChests: string[];
    completedSeelies: string[];
    completedPuzzles: string[];
    completedChallenges: string[];
  }): void {
    this.statueResonated = data.statueResonated;
    for (const wp of this.waypoints) {
      if (data.unlockedWaypoints.includes(wp.id)) this.markWaypointVisualUnlocked(wp);
    }
    for (const oc of this.anemoculi) {
      if (data.collectedAnemoculi.includes(oc.id)) {
        oc.collected = true;
        oc.mesh.visible = false;
      }
    }
    for (const ch of this.chests) {
      if (data.openedChests.includes(ch.id)) {
        ch.opened = true;
        ch.hiddenUntilUnlocked = false;
        ch.mesh.visible = true;
        ch.lid.rotation.x = -1.65;
        if (ch.barrierMesh) ch.barrierMesh.visible = false;
      }
    }
    for (const s of this.seelies) {
      if (data.completedSeelies.includes(s.id)) {
        s.completed = true;
        const last = s.waypoints[s.waypoints.length - 1];
        s.pos.set(last[0], getTerrainHeight(last[0], last[1]) + 1.5, last[1]);
        s.mesh.position.copy(s.pos);
        this.revealHiddenChest(s.rewardChestId);
      }
    }
    for (const m of this.monuments) {
      if (data.completedPuzzles.includes(m.puzzleId)) {
        m.lit = true;
        m.orbMat.emissiveIntensity = 2.8;
        this.revealHiddenChest(`chest_puzzle_${m.puzzleId}`);
      }
    }
    for (const t of this.trials) {
      if (data.completedChallenges.includes(t.id)) {
        t.completed = true;
        t.pillarMesh.visible = false;
      }
    }
  }

  public triggerElementalSight(playerPos: THREE.Vector3): void {
    this.clearSightBeacons();
    this.sightTimer = 5.0;

    const beaconMatGold = new THREE.MeshBasicMaterial({
      color: 0xffe478,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beaconMatCyan = new THREE.MeshBasicMaterial({
      color: 0x62fff0,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const addBeacon = (x: number, y: number, z: number, mat: THREE.Material) => {
      if (Math.hypot(x - playerPos.x, z - playerPos.z) > 85) return;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 16, 10, 1, true), mat);
      beam.position.set(x, y + 8, z);
      this.scene.add(beam);
      this.sightBeacons.push(beam);
    };

    for (const ch of this.chests) {
      if (!ch.opened && !ch.hiddenUntilUnlocked) addBeacon(ch.x, ch.y, ch.z, beaconMatGold);
    }
    for (const oc of this.anemoculi) {
      if (!oc.collected) addBeacon(oc.x, oc.y - 2, oc.z, beaconMatCyan);
    }
    for (const s of this.seelies) {
      if (!s.completed) addBeacon(s.pos.x, s.pos.y, s.pos.z, beaconMatCyan);
    }
    for (const m of this.monuments) {
      if (!m.lit) addBeacon(m.x, m.y, m.z, beaconMatGold);
    }
  }

  public getActiveChallengeHUD(): ActiveChallengeHUD | null {
    const active = this.trials.find((t) => t.active);
    if (!active) return null;
    return {
      titleKr: active.nameKr,
      descKr: active.descKr,
      timeLeft: active.timeLeft,
      progress: active.collectedCount,
      target: active.orbCoords.length,
    };
  }

  public getDynamicColliders(): CylinderCollider[] {
    const out: CylinderCollider[] = [];
    for (const wp of this.waypoints) {
      out.push({ x: wp.x, z: wp.z, radius: 0.95, minY: wp.y - 0.5, maxY: wp.y + 3.0 });
    }
    for (const ch of this.chests) {
      if (ch.hiddenUntilUnlocked) continue;
      out.push({ x: ch.x, z: ch.z, radius: 0.62, minY: ch.y - 0.3, maxY: ch.y + 0.95, walkableTop: true });
    }
    for (const m of this.monuments) {
      out.push({ x: m.x, z: m.z, radius: 0.62, minY: m.y - 0.5, maxY: m.y + 2.8 });
    }
    for (const s of this.seelies) {
      const end = s.waypoints[s.waypoints.length - 1];
      const cy = getTerrainHeight(end[0], end[1]);
      out.push({ x: end[0], z: end[1], radius: 0.65, minY: cy - 0.5, maxY: cy + 1.45, walkableTop: true });
    }
    for (const ore of this.crystalOres) {
      if (ore.broken) continue;
      out.push({ x: ore.x, z: ore.z, radius: 0.7, minY: ore.y - 0.3, maxY: ore.y + 1.25 });
    }
    for (const f of this.cookingFires) {
      out.push({ x: f.x, z: f.z, radius: 0.58, minY: f.y - 0.3, maxY: f.y + 1.25 });
    }
    return out;
  }

  public tryHitMonument(pos: THREE.Vector3, radius: number, element: ElementType, onLit: (m: MonumentNode, solved: boolean) => void): void {
    for (const m of this.monuments) {
      if (m.lit) continue;
      if (m.element !== element) continue;
      const dist = Math.hypot(pos.x - m.x, pos.z - m.z);
      if (dist < radius + 1.5) {
        m.lit = true;
        m.orbMat.emissiveIntensity = 2.8;
        const groupMons = this.monuments.filter((other) => other.puzzleId === m.puzzleId);
        const solved = groupMons.every((other) => other.lit);
        if (solved) {
          this.revealHiddenChest(`chest_puzzle_${m.puzzleId}`);
        }
        onLit(m, solved);
      }
    }
  }

  public damageCrystalNear(pos: THREE.Vector3, radius: number, dmg: number, onBreak: (ore: CrystalOreNode) => void): void {
    for (const ore of this.crystalOres) {
      if (ore.broken) continue;
      const dist = Math.hypot(pos.x - ore.x, pos.y + 0.8 - ore.y, pos.z - ore.z);
      if (dist < radius + 1.15) {
        ore.hp -= dmg;
        if (ore.hp <= 0) {
          ore.broken = true;
          ore.respawnTimer = 90;
          ore.mesh.visible = false;
          onBreak(ore);
        }
      }
    }
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    activeCampIds: Set<string>,
    callbacks: InteractCallbacks,
  ): InteractablePrompt[] {
    this.elapsed += dt;
    const prompts: InteractablePrompt[] = [];

    // Update Elemental Sight beacons
    if (this.sightTimer > 0) {
      this.sightTimer -= dt;
      if (this.sightTimer <= 0) this.clearSightBeacons();
    }

    // 1. Statue of The Seven
    const dStatue = playerPos.distanceTo(this.statuePos);
    if (dStatue < 8.5) callbacks.onPassiveStatueHeal(dt);
    if (dStatue < 6.4) {
      prompts.push({
        id: 'statue_resonate',
        label: this.statueResonated ? '일곱신상 · 신의 은총으로 회복' : '일곱신상과 공명하기',
        subLabel: '파티 HP·스태미나 완전 회복',
        icon: '✧',
        distance: dStatue,
        action: () => {
          this.statueResonated = true;
          callbacks.onResonateStatue();
        },
      });
    }

    // 2. Domain Gate (비경)
    const dDomain = Math.hypot(playerPos.x - DOMAIN_GATE_POS.x, playerPos.z - DOMAIN_GATE_POS.z);
    if (dDomain < 5.5) {
      prompts.push({
        id: 'domain_gate',
        label: '비경 · 바람의 시련 도전',
        subLabel: '3웨이브 전투 시련 (+240 원석)',
        icon: '⛩',
        distance: dDomain,
        action: () => callbacks.onOpenDomain(),
      });
    }

    // 3. Cooking Campfires
    for (const fire of this.cookingFires) {
      const df = Math.hypot(playerPos.x - fire.x, playerPos.z - fire.z);
      if (df < 3.6) {
        prompts.push({
          id: `cook_${fire.x}`,
          label: '모닥불 요리하기',
          subLabel: '타이밍 미니게임',
          icon: '🍳',
          distance: df,
          action: () => callbacks.onOpenCooking(),
        });
      }
    }

    // 4. Waypoints
    for (const wp of this.waypoints) {
      wp.crystal.rotation.y += dt * 1.4;
      wp.crystal.position.y = 2.6 + Math.sin(this.elapsed * 2.4 + wp.x) * 0.16;
      const dist = Math.hypot(playerPos.x - wp.x, playerPos.z - wp.z);
      if (!wp.unlocked && dist < 4.5 && Math.abs(playerPos.y - wp.y) < 3.5) {
        prompts.push({
          id: wp.id,
          label: '워프 포인트 활성화',
          subLabel: wp.nameKr,
          icon: '✦',
          distance: dist,
          action: () => {
            this.markWaypointVisualUnlocked(wp);
            callbacks.onUnlockWaypoint(wp);
          },
        });
      }
    }

    // 5. Anemoculi
    for (const oc of this.anemoculi) {
      if (oc.collected) continue;
      oc.mesh.rotation.y += dt * 1.6;
      const ring = oc.mesh.children[1];
      if (ring) ring.rotation.z += dt * 2.1;
      const dist = Math.hypot(playerPos.x - oc.x, playerPos.y + 1.0 - oc.y, playerPos.z - oc.z);
      if (dist < 2.8) {
        oc.collected = true;
        oc.mesh.visible = false;
        callbacks.onCollectAnemoculus(oc);
      }
    }

    // 6. Seelie Escort Puzzles
    for (const s of this.seelies) {
      s.mesh.rotation.y += dt * 2.2;
      if (s.completed) {
        s.mesh.position.y = s.pos.y + Math.sin(this.elapsed * 3) * 0.14;
        continue;
      }
      const targetWp = s.waypoints[s.currentIndex];
      const targetPos = new THREE.Vector3(
        targetWp[0],
        getTerrainHeight(targetWp[0], targetWp[1]) + 1.75,
        targetWp[1],
      );
      const distToTarget = s.pos.distanceTo(targetPos);
      if (distToTarget > 0.25) {
        const step = targetPos.clone().sub(s.pos).normalize().multiplyScalar(Math.min(distToTarget, 6.2 * dt));
        s.pos.add(step);
      } else {
        const distPlayer = Math.hypot(playerPos.x - s.pos.x, playerPos.z - s.pos.z);
        if (distPlayer < 5.0) {
          if (s.currentIndex < s.waypoints.length - 1) {
            s.currentIndex++;
            callbacks.onSeelieStep();
          } else {
            s.completed = true;
            this.revealHiddenChest(s.rewardChestId);
            callbacks.onSeelieComplete(s);
          }
        }
      }
      s.mesh.position.set(s.pos.x, s.pos.y + Math.sin(this.elapsed * 3.5 + s.pos.x) * 0.22, s.pos.z);
    }

    // 7. Time-Trial Challenges
    for (const t of this.trials) {
      if (t.completed) continue;
      if (!t.active) {
        const dtDist = Math.hypot(playerPos.x - t.x, playerPos.z - t.z);
        if (dtDist < 4.2) {
          prompts.push({
            id: t.id,
            label: `도전 시작 · ${t.nameKr}`,
            subLabel: t.descKr,
            icon: '⚔',
            distance: dtDist,
            action: () => {
              t.active = true;
              t.timeLeft = t.duration;
              t.collectedCount = 0;
              t.orbMeshes.forEach((m) => (m.visible = true));
              callbacks.onChallengeStart(t);
            },
          });
        }
      } else {
        t.timeLeft -= dt;
        t.orbMeshes.forEach((orb, idx) => {
          if (!orb.visible) return;
          orb.rotation.y += dt * 2.5;
          const [ox, oy, oz] = t.orbCoords[idx];
          if (Math.hypot(playerPos.x - ox, playerPos.y + 1.1 - oy, playerPos.z - oz) < 2.9) {
            orb.visible = false;
            t.collectedCount++;
            callbacks.onSeelieStep();
          }
        });
        if (t.collectedCount >= t.orbCoords.length) {
          t.active = false;
          t.completed = true;
          t.pillarMesh.visible = false;
          callbacks.onChallengeComplete(t);
        } else if (t.timeLeft <= 0) {
          t.active = false;
          t.orbMeshes.forEach((m) => (m.visible = false));
          callbacks.onChallengeFail(t);
        }
      }
    }

    // 8. Treasure Chests
    for (const ch of this.chests) {
      if (ch.opened || ch.hiddenUntilUnlocked) continue;
      const isLocked = Boolean(ch.lockedByCamp && activeCampIds.has(ch.lockedByCamp));
      if (ch.barrierMesh) {
        ch.barrierMesh.visible = isLocked;
        if (isLocked) ch.barrierMesh.rotation.y += dt * 0.8;
      }
      const dist = Math.hypot(playerPos.x - ch.x, playerPos.z - ch.z);
      if (dist < 3.8 && Math.abs(playerPos.y - ch.y) < 3.2) {
        prompts.push({
          id: ch.id,
          label: isLocked ? `${ch.nameKr} (주변 마물 처치 필요)` : `${ch.nameKr} 열기`,
          icon: isLocked ? '🔒' : '❖',
          distance: dist,
          action: () => {
            if (isLocked) return;
            ch.opened = true;
            ch.lid.rotation.x = -1.65;
            if (ch.barrierMesh) ch.barrierMesh.visible = false;
            callbacks.onOpenChest(ch);
          },
        });
      }
    }

    // 9. Collectibles & Fluttering Crystalflies
    for (const item of this.collectibles) {
      if (item.collected) {
        item.respawnTimer -= dt;
        if (item.respawnTimer <= 0) {
          item.collected = false;
          item.mesh.visible = true;
        }
        continue;
      }
      if (item.kind === 'windwheel') {
        const spinner = item.mesh.children[1];
        if (spinner) spinner.rotation.z += dt * 2.5;
      } else if (item.isButterfly) {
        item.mesh.position.x = item.x + Math.sin(this.elapsed * 1.4 + item.z) * 1.6;
        item.mesh.position.y = item.y + 1.3 + Math.sin(this.elapsed * 2.8 + item.x) * 0.45;
        item.mesh.position.z = item.z + Math.cos(this.elapsed * 1.2 + item.x) * 1.6;
        item.mesh.rotation.y += dt * 2.2;
      }

      const dist = Math.hypot(playerPos.x - item.mesh.position.x, playerPos.z - item.mesh.position.z);
      if (dist < 2.9 && Math.abs(playerPos.y - item.y) < 2.8) {
        prompts.push({
          id: item.id,
          label: item.isButterfly ? `${item.nameKr} 포획` : `${item.nameKr} 채집`,
          icon: item.isButterfly ? '🦋' : '✿',
          distance: dist,
          action: () => {
            item.collected = true;
            item.respawnTimer = 60;
            item.mesh.visible = false;
            callbacks.onPickupCollectible(item);
          },
        });
      }
    }

    // 10. Crystal Ore Respawn
    for (const ore of this.crystalOres) {
      if (ore.broken) {
        ore.respawnTimer -= dt;
        if (ore.respawnTimer <= 0) {
          ore.broken = false;
          ore.hp = 100;
          ore.mesh.visible = true;
        }
      }
    }

    prompts.sort((a, b) => a.distance - b.distance);
    return prompts;
  }

  private clearSightBeacons(): void {
    for (const b of this.sightBeacons) {
      this.scene.remove(b);
      b.geometry.dispose();
    }
    this.sightBeacons = [];
  }

  private revealHiddenChest(chestId: string): void {
    const ch = this.chests.find((c) => c.id === chestId);
    if (ch && ch.hiddenUntilUnlocked) {
      ch.hiddenUntilUnlocked = false;
      ch.mesh.visible = true;
    }
  }

  private markWaypointVisualUnlocked(wp: WaypointNode): void {
    wp.unlocked = true;
    wp.crystalMat.color.setHex(0x62ecff);
    wp.crystalMat.emissive.setHex(0x28c6ff);
    wp.crystalMat.emissiveIntensity = 2.4;
  }

  private createWaypoints(scene: THREE.Scene): void {
    const toonMap = createToonGradientMap();
    const stoneMat = new THREE.MeshToonMaterial({ color: 0xbfc7d1, gradientMap: toonMap });
    const defs = [
      { id: 'wp_windrise', nameKr: '바람이 시작되는 곳', x: WORLD_LANDMARKS.windrise.x - 14, z: WORLD_LANDMARKS.windrise.z + 10 },
      { id: 'wp_windmill', nameKr: '몬드 풍차 언덕', x: WORLD_LANDMARKS.windmill.x - 10, z: WORLD_LANDMARKS.windmill.z - 12 },
      { id: 'wp_cliff', nameKr: '바람맞이 절벽', x: WORLD_LANDMARKS.cliff.x, z: WORLD_LANDMARKS.cliff.z },
      { id: 'wp_forest', nameKr: '속삭이는 숲', x: WORLD_LANDMARKS.forest.x, z: WORLD_LANDMARKS.forest.z },
    ];

    for (const def of defs) {
      const y = getTerrainHeight(def.x, def.z);
      const group = new THREE.Group();
      group.position.set(def.x, y, def.z);

      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.55, 8), stoneMat);
      ped.position.y = 0.28;
      ped.castShadow = true;
      ped.receiveShadow = true;
      group.add(ped);

      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 1.4, 6), stoneMat);
      spire.position.y = 1.15;
      spire.castShadow = true;
      group.add(spire);

      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0xff5a5a,
        emissive: 0xd93030,
        emissiveIntensity: 1.8,
        roughness: 0.25,
      });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), crystalMat);
      crystal.scale.set(0.85, 1.45, 0.85);
      crystal.position.y = 2.6;
      group.add(crystal);

      scene.add(group);
      this.waypoints.push({
        id: def.id,
        nameKr: def.nameKr,
        x: def.x,
        y,
        z: def.z,
        unlocked: false,
        mesh: group,
        crystal,
        crystalMat,
      });
    }
  }

  private createAnemoculi(scene: THREE.Scene): void {
    const spots: Array<[number, number, number]> = [
      [0, -4, 4.8],
      [0, -24, 10.6],
      [78, -58, 17.5],
      [48, -46, 12.5],
      [-58, -42, 3.8],
      [-78, 54, 11.2],
      [84, 58, 17.8],
      [14, -84, 16.5],
      [12, -118, 4.2],
      [-92, -108, 7.5],
    ];

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x7effdf,
      emissive: 0x3ef0be,
      emissiveIntensity: 2.5,
      transparent: true,
      opacity: 0.92,
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xffe49e,
      emissive: 0xffc857,
      emissiveIntensity: 1.8,
    });

    spots.forEach(([x, z, heightOffset], idx) => {
      const baseY = Math.max(WATER_Y, getTerrainHeight(x, z));
      const y = baseY + heightOffset;

      const group = new THREE.Group();
      group.position.set(x, y, z);

      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), coreMat);
      group.add(core);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 8, 24), ringMat);
      group.add(ring);

      scene.add(group);
      this.anemoculi.push({ id: `anemo_${idx}`, x, y, z, collected: false, mesh: group });
    });
  }

  private createChests(scene: THREE.Scene): void {
    const toonMap = createToonGradientMap();
    const specs: Array<{
      id: string;
      tier: ChestNode['tier'];
      x: number;
      z: number;
      lockedByCamp?: string;
      hiddenUntilUnlocked?: boolean;
    }> = [
      { id: 'chest_1', tier: 'common', x: 8, z: 16 },
      { id: 'chest_2', tier: 'common', x: -16, z: -12 },
      { id: 'chest_3', tier: 'exquisite', x: -58, z: -42 },
      { id: 'chest_4', tier: 'exquisite', x: 42, z: -38, lockedByCamp: 'camp_meadow' },
      { id: 'chest_5', tier: 'exquisite', x: 84, z: -64 },
      { id: 'chest_6', tier: 'precious', x: 90, z: 50 },
      { id: 'chest_7', tier: 'precious', x: 18, z: -124, lockedByCamp: 'camp_cliff' },
      { id: 'chest_8', tier: 'exquisite', x: -86, z: -104, lockedByCamp: 'camp_forest' },
      { id: 'chest_9', tier: 'common', x: -34, z: 34, lockedByCamp: 'camp_road' },
      { id: 'chest_10', tier: 'luxurious', x: -78, z: 48, lockedByCamp: 'camp_ruins_boss' },
      // Reward chests spawned by Seelies & Elemental Monument puzzles!
      { id: 'chest_seelie_1', tier: 'exquisite', x: 26, z: -18, hiddenUntilUnlocked: true },
      { id: 'chest_seelie_2', tier: 'precious', x: 68, z: -56, hiddenUntilUnlocked: true },
      { id: 'chest_puzzle_p1', tier: 'precious', x: -18, z: 8, hiddenUntilUnlocked: true },
      { id: 'chest_puzzle_p2', tier: 'precious', x: 42, z: 22, hiddenUntilUnlocked: true },
    ];

    const tierLabel: Record<ChestNode['tier'], string> = {
      common: '평범한 보물상자',
      exquisite: '정교한 보물상자',
      precious: '진귀한 보물상자',
      luxurious: '화려한 보물상자',
    };
    const tierColor: Record<ChestNode['tier'], number> = {
      common: 0x8b6745,
      exquisite: 0x4ca388,
      precious: 0xc97b38,
      luxurious: 0xe6b84c,
    };

    const barrierMat = new THREE.MeshBasicMaterial({
      color: 0xff4949,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    for (const sp of specs) {
      const y = getTerrainHeight(sp.x, sp.z);
      const group = new THREE.Group();
      group.position.set(sp.x, y, sp.z);
      if (sp.hiddenUntilUnlocked) group.visible = false;

      const bodyMat = new THREE.MeshToonMaterial({ color: tierColor[sp.tier], gradientMap: toonMap });
      const trimMat = new THREE.MeshStandardMaterial({
        color: sp.tier === 'luxurious' ? 0xffe082 : 0xd0d6de,
        metalness: 0.65,
        roughness: 0.3,
      });

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.58, 0.8), bodyMat);
      base.position.y = 0.29;
      base.castShadow = true;
      group.add(base);

      const lid = new THREE.Group();
      lid.position.set(0, 0.58, -0.4);
      const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.32, 0.82), bodyMat);
      lidMesh.position.set(0, 0.16, 0.4);
      lidMesh.castShadow = true;
      lid.add(lidMesh);

      const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.08), trimMat);
      clasp.position.set(0, 0.06, 0.82);
      lid.add(clasp);
      group.add(lid);

      let barrierMesh: THREE.Mesh | undefined;
      if (sp.lockedByCamp) {
        barrierMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 12, 1, true), barrierMat);
        barrierMesh.position.y = 1.1;
        group.add(barrierMesh);
      }

      scene.add(group);
      this.chests.push({
        id: sp.id,
        tier: sp.tier,
        nameKr: tierLabel[sp.tier],
        x: sp.x,
        y,
        z: sp.z,
        opened: false,
        hiddenUntilUnlocked: sp.hiddenUntilUnlocked,
        lockedByCamp: sp.lockedByCamp,
        mesh: group,
        lid,
        barrierMesh,
      });
    }
  }

  private createSeelies(scene: THREE.Scene): void {
    const toonMap = createToonGradientMap();
    const stoneMat = new THREE.MeshToonMaterial({ color: 0x9aa4b2, gradientMap: toonMap });
    const seelieMat = new THREE.MeshStandardMaterial({
      color: 0x80fff2,
      emissive: 0x42ffd8,
      emissiveIntensity: 2.6,
      transparent: true,
      opacity: 0.9,
    });

    const defs: Array<{ id: string; waypoints: Array<[number, number]>; rewardChestId: string }> = [
      {
        id: 'seelie_1',
        waypoints: [
          [11, 8],
          [17, -4],
          [24, -15],
        ],
        rewardChestId: 'chest_seelie_1',
      },
      {
        id: 'seelie_2',
        waypoints: [
          [52, -36],
          [60, -48],
          [66, -54],
        ],
        rewardChestId: 'chest_seelie_2',
      },
    ];

    for (const d of defs) {
      const start = d.waypoints[0];
      const end = d.waypoints[d.waypoints.length - 1];
      const pos = new THREE.Vector3(start[0], getTerrainHeight(start[0], start[1]) + 1.8, start[1]);

      const group = new THREE.Group();
      group.position.copy(pos);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 12), seelieMat);
      group.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.72, 8), seelieMat);
      tail.position.y = -0.42;
      tail.rotation.x = Math.PI;
      group.add(tail);
      scene.add(group);

      // Seelie Stone Court pedestal at destination
      const court = new THREE.Group();
      court.position.set(end[0], getTerrainHeight(end[0], end[1]), end[1]);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 1.35, 8), stoneMat);
      base.position.y = 0.67;
      court.add(base);
      scene.add(court);

      this.seelies.push({
        id: d.id,
        waypoints: d.waypoints,
        currentIndex: 0,
        pos,
        completed: false,
        mesh: group,
        courtMesh: court,
        rewardChestId: d.rewardChestId,
      });
    }
  }

  private createElementalMonuments(scene: THREE.Scene): void {
    const toonMap = createToonGradientMap();
    const stoneMat = new THREE.MeshToonMaterial({ color: 0x8c96a4, gradientMap: toonMap });

    const defs: Array<{ id: string; puzzleId: string; element: ElementType; x: number; z: number }> = [
      // Puzzle 1 near spawn road: Pyro + Anemo + Geo!
      { id: 'mon_1', puzzleId: 'p1', element: 'pyro', x: -14, z: 10 },
      { id: 'mon_2', puzzleId: 'p1', element: 'anemo', x: -18, z: 4 },
      { id: 'mon_3', puzzleId: 'p1', element: 'geo', x: -22, z: 10 },
      // Puzzle 2 near Windmill road: Cryo + Pyro
      { id: 'mon_4', puzzleId: 'p2', element: 'cryo', x: 38, z: 22 },
      { id: 'mon_5', puzzleId: 'p2', element: 'pyro', x: 46, z: 22 },
    ];

    for (const d of defs) {
      const y = getTerrainHeight(d.x, d.z);
      const group = new THREE.Group();
      group.position.set(d.x, y, d.z);

      const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 2.2, 6), stoneMat);
      obelisk.position.y = 1.1;
      obelisk.castShadow = true;
      group.add(obelisk);

      const col = ELEMENT_COLORS[d.element].hex;
      const orbMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.45,
      });
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), orbMat);
      orb.position.y = 2.65;
      group.add(orb);

      scene.add(group);
      this.monuments.push({
        id: d.id,
        puzzleId: d.puzzleId,
        element: d.element,
        x: d.x,
        y,
        z: d.z,
        lit: false,
        mesh: group,
        orbMat,
      });
    }
  }

  private createTimeTrials(scene: THREE.Scene): void {
    const swordMat = new THREE.MeshStandardMaterial({
      color: 0xff4d5a,
      emissive: 0xff2a3c,
      emissiveIntensity: 2.2,
    });
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x62ffda,
      emissive: 0x3ef0be,
      emissiveIntensity: 2.5,
    });

    const defs: Array<{
      id: string;
      nameKr: string;
      descKr: string;
      x: number;
      z: number;
      duration: number;
      points: Array<[number, number, number]>;
    }> = [
      {
        id: 'trial_wind',
        nameKr: '바람의 입자 질주 도전',
        descKr: '30초 안에 빛나는 바람 입자 6개 수집',
        x: 20,
        z: -24,
        duration: 30,
        points: [
          [26, 2.0, -28],
          [34, 2.2, -32],
          [42, 2.4, -36],
          [48, 7.5, -44],
          [55, 8.0, -50],
          [64, 3.0, -54],
        ],
      },
    ];

    for (const d of defs) {
      const y = getTerrainHeight(d.x, d.z);
      const pillar = new THREE.Group();
      pillar.position.set(d.x, y, d.z);
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 4), swordMat);
      blade.position.y = 1.4;
      pillar.add(blade);
      scene.add(pillar);

      const orbCoords: Array<[number, number, number]> = [];
      const orbMeshes: THREE.Mesh[] = [];
      for (const [ox, hOff, oz] of d.points) {
        const oy = getTerrainHeight(ox, oz) + hOff;
        orbCoords.push([ox, oy, oz]);
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), orbMat);
        orb.position.set(ox, oy, oz);
        orb.visible = false;
        scene.add(orb);
        orbMeshes.push(orb);
      }

      this.trials.push({
        id: d.id,
        nameKr: d.nameKr,
        descKr: d.descKr,
        x: d.x,
        y,
        z: d.z,
        completed: false,
        active: false,
        duration: d.duration,
        timeLeft: d.duration,
        orbCoords,
        orbMeshes,
        collectedCount: 0,
        pillarMesh: pillar,
      });
    }
  }

  private createCookingCampfires(scene: THREE.Scene): void {
    const toonMap = createToonGradientMap();
    const potMat = new THREE.MeshToonMaterial({ color: 0x3b3d45, gradientMap: toonMap });
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff8030,
      emissive: 0xff521b,
      emissiveIntensity: 2.3,
    });

    for (const f of this.cookingFires) {
      const g = new THREE.Group();
      g.position.set(f.x, f.y, f.z);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.72, 7), flameMat);
      flame.position.y = 0.36;
      g.add(flame);

      const pot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6), potMat);
      pot.position.y = 1.05;
      g.add(pot);
      scene.add(g);
    }
  }

  private createCollectibles(scene: THREE.Scene): void {
    const toonMap = createToonGradientMap();
    const stemMat = new THREE.MeshToonMaterial({ color: 0x4ca64a, gradientMap: toonMap });
    const sweetMat = new THREE.MeshToonMaterial({ color: 0xffe45e, gradientMap: toonMap });
    const windMat = new THREE.MeshToonMaterial({ color: 0xff6b54, gradientMap: toonMap });
    const sunsetMat = new THREE.MeshToonMaterial({ color: 0xff923d, gradientMap: toonMap });
    const flyMat = new THREE.MeshStandardMaterial({
      color: 0x80ffe8,
      emissive: 0x42ffcf,
      emissiveIntensity: 2.4,
      side: THREE.DoubleSide,
    });

    let seed = 55522;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < 28; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = 12 + rand() * 125;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = getTerrainHeight(x, z);
      if (y < WATER_Y + 0.6) continue;

      const roll = i % 3;
      const kind: CollectibleNode['kind'] =
        roll === 0 ? 'sweet_flower' : roll === 1 ? 'windwheel' : 'sunsettia';
      const nameKr =
        kind === 'sweet_flower' ? '달콤달콤꽃' : kind === 'windwheel' ? '풍차 국화' : '일몰 열매';

      const group = new THREE.Group();
      group.position.set(x, y, z);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.55, 5), stemMat);
      stem.position.y = 0.27;
      group.add(stem);

      if (kind === 'sweet_flower') {
        const bloom = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), sweetMat);
        bloom.position.y = 0.58;
        group.add(bloom);
      } else if (kind === 'windwheel') {
        const spinner = new THREE.Group();
        spinner.position.set(0, 0.62, 0);
        for (let p = 0; p < 4; p++) {
          const petal = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.36, 0.04), windMat);
          petal.rotation.z = (p * Math.PI) / 2;
          petal.position.set(Math.cos((p * Math.PI) / 2) * 0.14, Math.sin((p * Math.PI) / 2) * 0.14, 0);
          spinner.add(petal);
        }
        group.add(spinner);
      } else {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), sunsetMat);
        fruit.position.y = 0.45;
        group.add(fruit);
      }

      scene.add(group);
      this.collectibles.push({
        id: `fl_${i}`,
        kind,
        nameKr,
        x,
        y,
        z,
        collected: false,
        mesh: group,
        respawnTimer: 0,
      });
    }

    // Add 6 glowing fluttering Crystalflies around Statue & Windrise!
    const flySpots: Array<[number, number]> = [
      [-6, -18], [7, -20], [5, -30], [72, -52], [82, -54], [76, -64],
    ];
    flySpots.forEach(([x, z], idx) => {
      const y = getTerrainHeight(x, z);
      const group = new THREE.Group();
      group.position.set(x, y + 1.4, z);
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.22), flyMat);
        wing.position.x = s * 0.16;
        wing.rotation.y = s * 0.45;
        group.add(wing);
      }
      scene.add(group);
      this.collectibles.push({
        id: `fly_${idx}`,
        kind: 'crystal_core',
        nameKr: '바람 수정 나비',
        x,
        y,
        z,
        collected: false,
        mesh: group,
        respawnTimer: 0,
        isButterfly: true,
      });
    });
  }

  private createCrystalOres(scene: THREE.Scene): void {
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x6ce8ff,
      emissive: 0x2692c8,
      emissiveIntensity: 1.35,
      roughness: 0.2,
      metalness: 0.3,
    });

    const spots: Array<[number, number]> = [
      [-18, 18], [26, 22], [18, -98], [6, -110], [-68, 36], [-86, 62],
      [72, 48], [94, 68], [-44, -22], [58, -72], [-96, -92], [32, -52],
    ];

    spots.forEach(([x, z], idx) => {
      const y = getTerrainHeight(x, z);
      const group = new THREE.Group();
      group.position.set(x, y, z);

      for (let c = 0; c < 4; c++) {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.05 + (c % 2) * 0.35, 5), crystalMat);
        const a = (c / 4) * Math.PI * 2;
        shard.position.set(Math.cos(a) * 0.28, 0.45, Math.sin(a) * 0.28);
        shard.rotation.z = -Math.cos(a) * 0.38;
        shard.rotation.x = Math.sin(a) * 0.38;
        shard.castShadow = true;
        group.add(shard);
      }

      scene.add(group);
      this.crystalOres.push({
        id: `ore_${idx}`,
        x,
        y,
        z,
        hp: 100,
        broken: false,
        mesh: group,
        respawnTimer: 0,
      });
    });
  }
}
