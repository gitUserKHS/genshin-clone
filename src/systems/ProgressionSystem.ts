import {
  ALL_CHARACTERS,
  ARTIFACT_SETS,
  CHARACTERS,
  DEFAULT_ACTIVE_PARTY,
  DEFAULT_ARTIFACTS,
  DEFAULT_WEAPONS,
  WEAPONS,
} from '../characters/CharacterData';
import type {
  ArtifactSetId,
  CharacterId,
  CharacterRuntime,
  ElementType,
  QuestDef,
  ShieldState,
} from '../core/Types';

export interface InventoryItem {
  id: string;
  nameKr: string;
  count: number;
  descKr: string;
  isFood?: boolean;
  healAmount?: number;
  atkBuffDuration?: number;
}

export interface WishResultItem {
  kind: 'character' | 'weapon';
  id: string;
  nameKr: string;
  rarity: 3 | 4 | 5;
  element?: ElementType;
  isNew: boolean;
}

const SAVE_KEY = 'genshin_clone_save_v2';

export class ProgressionSystem {
  public adventureRank = 30;
  public adventureExp = 0;
  public primogems = 3200; // Start with 20 wishes!
  public mora = 120000;

  public activeParty: CharacterId[] = [...DEFAULT_ACTIVE_PARTY];
  public activeCharacterId: CharacterId = DEFAULT_ACTIVE_PARTY[0];
  public party: Record<CharacterId, CharacterRuntime>;

  public ownedWeapons: string[] = [
    'favonius_sword',
    'prototype_archaic',
    'widsith',
    'lions_roar',
    'amenoma',
    'favonius_lance',
    'harbinger_of_dawn',
    'debate_club',
    'thrilling_tales',
    'white_tassel',
  ];

  public ownedArtifactSets: ArtifactSetId[] = [
    'viridescent',
    'crimson_witch',
    'emblem',
    'blizzard',
    'archaic_petra',
  ];

  // Active character shield & food ATK buff
  public shield: ShieldState | null = null;
  public atkBuffTimer = 0;

  public inventory: Record<string, InventoryItem> = {
    sweet_madame: {
      id: 'sweet_madame',
      nameKr: '달콤달콤 닭고기 스튜',
      count: 8,
      descKr: '선택한 캐릭터의 HP를 4,200pt 회복합니다. (단축키 H)',
      isFood: true,
      healAmount: 4200,
    },
    delicious_madame: {
      id: 'delicious_madame',
      nameKr: '맛있는 달콤달콤 닭고기 스튜',
      count: 2,
      descKr: '완벽한 타이밍으로 완성한 요리! HP를 6,800pt 회복합니다.',
      isFood: true,
      healAmount: 6800,
    },
    adeptus_temptation: {
      id: 'adeptus_temptation',
      nameKr: '선도장 (★5 버프 요리)',
      count: 2,
      descKr: '60초간 파티 전체 공격력 +30%, 치명타 확률 +12% 증가!',
      isFood: true,
      atkBuffDuration: 60,
    },
    sweet_flower: {
      id: 'sweet_flower',
      nameKr: '달콤달콤꽃',
      count: 8,
      descKr: '요리에 사용되는 향기로운 노란 꽃입니다.',
    },
    windwheel: {
      id: 'windwheel',
      nameKr: '풍차 국화',
      count: 4,
      descKr: '몬드의 바람을 사랑하는 붉은 꽃입니다.',
    },
    sunsettia: {
      id: 'sunsettia',
      nameKr: '일몰 열매',
      count: 5,
      descKr: '섭취 시 HP 1,600pt 회복.',
      isFood: true,
      healAmount: 1600,
    },
    crystal_ore: {
      id: 'crystal_ore',
      nameKr: '수정 덩이',
      count: 10,
      descKr: '무기 제련과 강화에 사용되는 영롱한 광석입니다.',
    },
    crystal_core: {
      id: 'crystal_core',
      nameKr: '수정 코어',
      count: 2,
      descKr: '수정 나비에게서 얻는 반짝이는 원소 결정입니다.',
    },
  };

  public statueResonated = false;
  public unlockedWaypoints = new Set<string>();
  public collectedAnemoculi = new Set<string>();
  public openedChests = new Set<string>();
  public completedSeelies = new Set<string>();
  public completedPuzzles = new Set<string>();
  public completedChallenges = new Set<string>();
  public domainClears = 0;
  public bossDefeatedCount = 0;

  public wishPity4 = 0;
  public wishPity5 = 0;

  public quests: QuestDef[] = [
    {
      id: 'q_statue',
      titleKr: '바람의 인도',
      descKr: '일곱신상과 공명하기',
      current: 0,
      target: 1,
      completed: false,
      rewardPrimogems: 160,
    },
    {
      id: 'q_seelie',
      titleKr: '선령과 원소 기믹',
      descKr: '선령 인도 또는 원소 비석 퍼즐 완료',
      current: 0,
      target: 2,
      completed: false,
      rewardPrimogems: 200,
    },
    {
      id: 'q_waypoints',
      titleKr: '몬드의 모험가',
      descKr: '워프 포인트 활성화',
      current: 0,
      target: 4,
      completed: false,
      rewardPrimogems: 200,
    },
    {
      id: 'q_oculi',
      titleKr: '바람을 품은 자',
      descKr: '바람 신의 눈동자 수집',
      current: 0,
      target: 10,
      completed: false,
      rewardPrimogems: 320,
    },
    {
      id: 'q_boss',
      titleKr: '유적의 위협',
      descKr: '속삭임의 유적 가디언 처치',
      current: 0,
      target: 1,
      completed: false,
      rewardPrimogems: 320,
    },
    {
      id: 'q_domain',
      titleKr: '바람의 시련 비경',
      descKr: '비경 3웨이브 시련 클리어',
      current: 0,
      target: 1,
      completed: false,
      rewardPrimogems: 400,
    },
    {
      id: 'q_chests',
      titleKr: '보물 사냥꾼',
      descKr: '보물상자 개봉',
      current: 0,
      target: 10,
      completed: false,
      rewardPrimogems: 240,
    },
  ];

  public onQuestCompleted?: (quest: QuestDef) => void;

  constructor() {
    this.party = this.createInitialParty();
    this.load();
  }

  private createInitialParty(): Record<CharacterId, CharacterRuntime> {
    const out = {} as Record<CharacterId, CharacterRuntime>;
    for (const id of ALL_CHARACTERS) {
      const def = CHARACTERS[id];
      out[id] = {
        id,
        level: 90,
        hp: def.baseHp,
        maxHp: def.baseHp,
        energy: def.burstCost,
        maxEnergy: def.burstCost,
        skillCd: 0,
        burstCd: 0,
        constellation: 0,
        weaponId: DEFAULT_WEAPONS[id],
        weaponRefine: 1,
        artifactSetId: DEFAULT_ARTIFACTS[id],
        infusionTimer: 0,
        infusionElement: null,
        isAlive: true,
      };
    }
    return out;
  }

  public getActiveCharacter(): CharacterRuntime {
    return this.party[this.activeCharacterId];
  }

  public getResonanceSummary(): { labelKr: string; atkBonus: number; critBonus: number; dmgBonus: number } {
    const elements = this.activeParty.map((id) => CHARACTERS[id].element);
    const counts = new Map<ElementType, number>();
    for (const el of elements) counts.set(el, (counts.get(el) ?? 0) + 1);

    let atkBonus = 0;
    let critBonus = 0;
    let dmgBonus = 0;
    const labels: string[] = [];

    if ((counts.get('pyro') ?? 0) >= 2) {
      atkBonus += 0.25;
      labels.push('열정의 불 (ATK+25%)');
    }
    if ((counts.get('cryo') ?? 0) >= 2) {
      critBonus += 0.15;
      labels.push('분쇄의 얼음 (CRIT+15%)');
    }
    if ((counts.get('geo') ?? 0) >= 2) {
      dmgBonus += 0.15;
      labels.push('부동의 바위 (피해+15%)');
    }
    if (counts.size === 4) {
      atkBonus += 0.12;
      dmgBonus += 0.1;
      labels.push('교차하는 원소 (4원소 공명: ATK+12%, 피해+10%)');
    }
    if (labels.length === 0) {
      labels.push('자유 편성 공명 (ATK+8%)');
      atkBonus += 0.08;
    }

    return { labelKr: labels.join(' · '), atkBonus, critBonus, dmgBonus };
  }

  public getComputedStats(id: CharacterId): {
    maxHp: number;
    atk: number;
    critRate: number;
    critDmg: number;
    elemDmgBonus: number;
  } {
    const def = CHARACTERS[id];
    const rt = this.party[id];
    const weapon = WEAPONS[rt.weaponId] || WEAPONS[DEFAULT_WEAPONS[id]];
    const artifact = ARTIFACT_SETS[rt.artifactSetId] || ARTIFACT_SETS[DEFAULT_ARTIFACTS[id]];
    const res = this.getResonanceSummary();

    const lvMult = 0.72 + (rt.level / 90) * 0.4;
    const constMult = 1 + rt.constellation * 0.1;
    const refineMult = 1 + (rt.weaponRefine - 1) * 0.08;
    const foodAtk = this.atkBuffTimer > 0 ? 0.3 : 0;
    const foodCrit = this.atkBuffTimer > 0 ? 0.12 : 0;

    const atk = Math.round(
      (def.baseAtk + weapon.baseAtk * refineMult) *
        lvMult *
        constMult *
        (1.38 + artifact.atkPct + res.atkBonus + foodAtk),
    );
    const critRate = Math.min(
      0.98,
      def.critRate + weapon.critBonus + artifact.critRateBonus + res.critBonus + foodCrit + rt.constellation * 0.02,
    );
    const critDmg = def.critDmg + artifact.critDmgBonus + rt.constellation * 0.08;
    const elemDmgBonus = weapon.elemBonus + artifact.elemDmgBonus + res.dmgBonus;

    return {
      maxHp: rt.maxHp,
      atk,
      critRate,
      critDmg,
      elemDmgBonus,
    };
  }

  public setActivePartySlot(slotIndex: number, charId: CharacterId): void {
    if (slotIndex < 0 || slotIndex > 3) return;
    const existingIdx = this.activeParty.indexOf(charId);
    if (existingIdx !== -1) {
      // Swap slots cleanly
      const tmp = this.activeParty[slotIndex];
      this.activeParty[slotIndex] = charId;
      this.activeParty[existingIdx] = tmp;
    } else {
      this.activeParty[slotIndex] = charId;
    }
    if (!this.activeParty.includes(this.activeCharacterId)) {
      this.activeCharacterId = this.activeParty[0];
    }
    this.save();
  }

  public switchCharacter(id: CharacterId): boolean {
    if (this.activeCharacterId === id) return false;
    if (!this.party[id].isAlive) return false;
    this.activeCharacterId = id;
    this.save();
    return true;
  }

  public equipWeapon(charId: CharacterId, weaponId: string): void {
    const char = this.party[charId];
    const w = WEAPONS[weaponId];
    if (!w || w.type !== CHARACTERS[charId].weaponType) return;
    char.weaponId = weaponId;
    this.save();
  }

  public refineCharacterWeapon(charId: CharacterId): boolean {
    const char = this.party[charId];
    if (char.weaponRefine >= 5) return false;
    const ore = this.inventory.crystal_ore;
    if (!ore || ore.count < 3 || this.mora < 10000) return false;
    ore.count -= 3;
    this.mora -= 10000;
    char.weaponRefine++;
    this.save();
    return true;
  }

  public equipArtifactSet(charId: CharacterId, setId: ArtifactSetId): void {
    this.party[charId].artifactSetId = setId;
    this.save();
  }

  public applyShield(amount: number, element: ElementType, duration: number): void {
    if (!this.shield || amount >= this.shield.hp) {
      this.shield = { hp: amount, maxHp: amount, element, timer: duration };
    } else {
      this.shield.timer = Math.max(this.shield.timer, duration);
    }
  }

  public tickBuffs(dt: number): void {
    if (this.shield) {
      this.shield.timer -= dt;
      if (this.shield.timer <= 0 || this.shield.hp <= 0) {
        this.shield = null;
      }
    }
    if (this.atkBuffTimer > 0) {
      this.atkBuffTimer = Math.max(0, this.atkBuffTimer - dt);
    }
  }

  public addEnergyAll(element: ElementType, amount: number): void {
    for (const id of this.activeParty) {
      const c = this.party[id];
      if (!c.isAlive) continue;
      const mult = CHARACTERS[c.id].element === element ? 1.55 : 0.92;
      c.energy = Math.min(c.maxEnergy, c.energy + amount * mult);
    }
  }

  public healPartyFull(): void {
    for (const c of Object.values(this.party)) {
      c.isAlive = true;
      c.hp = c.maxHp;
    }
    this.save();
  }

  public consumeFood(itemId: string): { healed: number; buffed: boolean } {
    const item = this.inventory[itemId];
    if (!item || !item.isFood || item.count <= 0) return { healed: 0, buffed: false };

    if (item.atkBuffDuration) {
      item.count--;
      this.atkBuffTimer = item.atkBuffDuration;
      this.save();
      return { healed: 0, buffed: true };
    }

    const c = this.getActiveCharacter();
    if (!c.isAlive) {
      c.isAlive = true;
      c.hp = Math.round(c.maxHp * 0.4);
    }
    const before = c.hp;
    c.hp = Math.min(c.maxHp, c.hp + (item.healAmount ?? 2500));
    item.count--;
    this.save();
    return { healed: c.hp - before, buffed: false };
  }

  public cookResult(perfect: boolean): boolean {
    const flowers = this.inventory.sweet_flower;
    if (!flowers || flowers.count < 2) return false;
    flowers.count -= 2;
    if (perfect) {
      this.addItem('delicious_madame', '맛있는 달콤달콤 닭고기 스튜', 1);
    } else {
      this.addItem('sweet_madame', '달콤달콤 닭고기 스튜', 1);
    }
    this.save();
    return true;
  }

  public damageActiveCharacter(rawDmg: number): { took: number; absorbedByShield: boolean; died: boolean; switchedTo?: CharacterId } {
    const c = this.getActiveCharacter();
    if (!c.isAlive) return { took: 0, absorbedByShield: false, died: false };
    let dmg = Math.max(1, Math.round(rawDmg));

    // Shield absorbs damage first!
    if (this.shield && this.shield.hp > 0) {
      if (this.shield.hp >= dmg) {
        this.shield.hp -= dmg;
        return { took: 0, absorbedByShield: true, died: false };
      } else {
        dmg -= this.shield.hp;
        this.shield = null;
      }
    }

    c.hp = Math.max(0, c.hp - dmg);
    if (c.hp <= 0) {
      c.isAlive = false;
      const next = this.activeParty.find((id) => this.party[id].isAlive);
      if (next) {
        this.activeCharacterId = next;
        return { took: dmg, absorbedByShield: false, died: true, switchedTo: next };
      }
      return { took: dmg, absorbedByShield: false, died: true };
    }
    return { took: dmg, absorbedByShield: false, died: false };
  }

  public addPrimogems(amount: number): void {
    this.primogems += amount;
    this.save();
  }

  public addMora(amount: number): void {
    this.mora += amount;
    this.save();
  }

  public addExp(amount: number): boolean {
    this.adventureExp += amount;
    let leveled = false;
    const needed = () => this.adventureRank * 180;
    while (this.adventureExp >= needed() && this.adventureRank < 60) {
      this.adventureExp -= needed();
      this.adventureRank++;
      this.primogems += 160;
      leveled = true;
    }
    this.save();
    return leveled;
  }

  public addItem(id: string, nameKr: string, count: number): void {
    if (this.inventory[id]) {
      this.inventory[id].count += count;
    } else {
      this.inventory[id] = {
        id,
        nameKr,
        count,
        descKr: '모험 중에 획득한 티바트 특산물입니다.',
      };
    }
    this.save();
  }

  public markStatueResonated(): void {
    if (!this.statueResonated) {
      this.statueResonated = true;
      this.primogems += 160;
      this.addExp(300);
      this.setQuestProgress('q_statue', 1);
    }
    this.healPartyFull();
    this.save();
  }

  public markWaypointUnlocked(id: string): void {
    if (!this.unlockedWaypoints.has(id)) {
      this.unlockedWaypoints.add(id);
      this.primogems += 60;
      this.addExp(150);
      this.setQuestProgress('q_waypoints', this.unlockedWaypoints.size);
      this.save();
    }
  }

  public markAnemoculusCollected(id: string): void {
    if (!this.collectedAnemoculi.has(id)) {
      this.collectedAnemoculi.add(id);
      this.primogems += 50;
      this.addExp(120);
      this.setQuestProgress('q_oculi', this.collectedAnemoculi.size);
      this.save();
    }
  }

  public markSeelieOrPuzzleCompleted(id: string, isSeelie: boolean): void {
    const set = isSeelie ? this.completedSeelies : this.completedPuzzles;
    if (!set.has(id)) {
      set.add(id);
      this.primogems += 80;
      this.mora += 5000;
      this.addExp(180);
      this.setQuestProgress('q_seelie', this.completedSeelies.size + this.completedPuzzles.size);
      this.save();
    }
  }

  public markChallengeCompleted(id: string): void {
    if (!this.completedChallenges.has(id)) {
      this.completedChallenges.add(id);
      this.primogems += 120;
      this.mora += 8000;
      this.addExp(220);
      this.save();
    }
  }

  public markDomainCleared(): void {
    this.domainClears++;
    this.primogems += 240;
    this.mora += 25000;
    this.addItem('adeptus_temptation', '선도장 (★5 버프 요리)', 1);
    this.addExp(420);
    this.setQuestProgress('q_domain', this.domainClears);
    this.save();
  }

  public markChestOpened(id: string, tier: 'common' | 'exquisite' | 'precious' | 'luxurious'): { primo: number; mora: number } {
    if (this.openedChests.has(id)) return { primo: 0, mora: 0 };
    this.openedChests.add(id);
    const rewards = {
      common: { primo: 30, mora: 2000, exp: 80 },
      exquisite: { primo: 60, mora: 4000, exp: 140 },
      precious: { primo: 100, mora: 8000, exp: 220 },
      luxurious: { primo: 200, mora: 18000, exp: 400 },
    }[tier];
    this.primogems += rewards.primo;
    this.mora += rewards.mora;
    this.addItem('sweet_madame', '달콤달콤 닭고기 스튜', 1);
    this.addExp(rewards.exp);
    this.setQuestProgress('q_chests', this.openedChests.size);
    this.save();
    return { primo: rewards.primo, mora: rewards.mora };
  }

  public markBossDefeated(): void {
    this.bossDefeatedCount++;
    this.setQuestProgress('q_boss', 1);
    this.save();
  }

  private setQuestProgress(id: string, value: number): void {
    const q = this.quests.find((item) => item.id === id);
    if (!q) return;
    q.current = Math.min(q.target, value);
    if (!q.completed && q.current >= q.target) {
      q.completed = true;
      this.primogems += q.rewardPrimogems;
      this.onQuestCompleted?.(q);
    }
  }

  public performWish(count: 1 | 10): WishResultItem[] | null {
    const cost = count * 160;
    if (this.primogems < cost) return null;
    this.primogems -= cost;

    const results: WishResultItem[] = [];
    const fiveStarWeapons = Object.values(WEAPONS).filter((w) => w.rarity === 5);
    const fourStarWeapons = Object.values(WEAPONS).filter((w) => w.rarity === 4);
    const threeStarWeapons = Object.values(WEAPONS).filter((w) => w.rarity === 3);

    for (let i = 0; i < count; i++) {
      this.wishPity4++;
      this.wishPity5++;

      const rate5 = this.wishPity5 >= 65 ? 0.3 : 0.065;
      const roll = Math.random();
      let rarity: 3 | 4 | 5 = 3;
      if (this.wishPity5 >= 75 || roll < rate5) {
        rarity = 5;
        this.wishPity5 = 0;
        this.wishPity4 = 0;
      } else if (this.wishPity4 >= 10 || roll < rate5 + 0.16) {
        rarity = 4;
        this.wishPity4 = 0;
      }

      if (rarity === 5) {
        if (Math.random() < 0.55) {
          const cid = ALL_CHARACTERS[Math.floor(Math.random() * ALL_CHARACTERS.length)];
          const char = this.party[cid];
          char.constellation = Math.min(6, char.constellation + 1);
          results.push({
            kind: 'character',
            id: cid,
            nameKr: `${CHARACTERS[cid].nameKr} (운명의 자리 Lv.${char.constellation})`,
            rarity: 5,
            element: CHARACTERS[cid].element,
            isNew: false,
          });
        } else {
          const w = fiveStarWeapons[Math.floor(Math.random() * fiveStarWeapons.length)];
          const isNew = !this.ownedWeapons.includes(w.id);
          if (isNew) this.ownedWeapons.push(w.id);
          results.push({ kind: 'weapon', id: w.id, nameKr: w.nameKr, rarity: 5, isNew });
        }
      } else if (rarity === 4) {
        const w = fourStarWeapons[Math.floor(Math.random() * fourStarWeapons.length)];
        const isNew = !this.ownedWeapons.includes(w.id);
        if (isNew) this.ownedWeapons.push(w.id);
        results.push({ kind: 'weapon', id: w.id, nameKr: w.nameKr, rarity: 4, isNew });
      } else {
        const w = threeStarWeapons[Math.floor(Math.random() * threeStarWeapons.length)];
        if (!this.ownedWeapons.includes(w.id)) this.ownedWeapons.push(w.id);
        results.push({ kind: 'weapon', id: w.id, nameKr: w.nameKr, rarity: 3, isNew: false });
      }
    }

    this.save();
    return results;
  }

  public getExplorationPercent(): number {
    const pts =
      (this.statueResonated ? 1 : 0) +
      this.unlockedWaypoints.size +
      this.collectedAnemoculi.size +
      this.openedChests.size +
      this.completedSeelies.size +
      this.completedPuzzles.size +
      this.completedChallenges.size;
    return Math.min(100, Math.round((pts / 32) * 100));
  }

  public save(): void {
    try {
      const payload = {
        adventureRank: this.adventureRank,
        adventureExp: this.adventureExp,
        primogems: this.primogems,
        mora: this.mora,
        activeParty: this.activeParty,
        activeCharacterId: this.activeCharacterId,
        party: ALL_CHARACTERS.map((id) => ({
          id,
          constellation: this.party[id].constellation,
          weaponId: this.party[id].weaponId,
          weaponRefine: this.party[id].weaponRefine,
          artifactSetId: this.party[id].artifactSetId,
        })),
        ownedWeapons: this.ownedWeapons,
        statueResonated: this.statueResonated,
        unlockedWaypoints: Array.from(this.unlockedWaypoints),
        collectedAnemoculi: Array.from(this.collectedAnemoculi),
        openedChests: Array.from(this.openedChests),
        completedSeelies: Array.from(this.completedSeelies),
        completedPuzzles: Array.from(this.completedPuzzles),
        completedChallenges: Array.from(this.completedChallenges),
        domainClears: this.domainClears,
        bossDefeatedCount: this.bossDefeatedCount,
        wishPity4: this.wishPity4,
        wishPity5: this.wishPity5,
        inventoryCounts: Object.fromEntries(Object.entries(this.inventory).map(([k, v]) => [k, v.count])),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota
    }
  }

  public load(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.adventureRank === 'number') this.adventureRank = data.adventureRank;
      if (typeof data.adventureExp === 'number') this.adventureExp = data.adventureExp;
      if (typeof data.primogems === 'number') this.primogems = data.primogems;
      if (typeof data.mora === 'number') this.mora = data.mora;
      if (Array.isArray(data.activeParty) && data.activeParty.length === 4) {
        const valid = data.activeParty.filter((id: string) => Boolean(this.party[id as CharacterId]));
        if (valid.length === 4) this.activeParty = valid;
      }
      if (data.activeCharacterId && this.activeParty.includes(data.activeCharacterId)) {
        this.activeCharacterId = data.activeCharacterId;
      } else {
        this.activeCharacterId = this.activeParty[0];
      }
      if (Array.isArray(data.party)) {
        for (const p of data.party) {
          const rt = this.party[p.id as CharacterId];
          if (rt) {
            rt.constellation = p.constellation ?? 0;
            rt.weaponRefine = p.weaponRefine ?? 1;
            if (p.weaponId && WEAPONS[p.weaponId]) rt.weaponId = p.weaponId;
            if (p.artifactSetId && ARTIFACT_SETS[p.artifactSetId as ArtifactSetId]) {
              rt.artifactSetId = p.artifactSetId;
            }
          }
        }
      }
      if (Array.isArray(data.ownedWeapons)) this.ownedWeapons = data.ownedWeapons;
      if (data.statueResonated) this.statueResonated = true;
      if (Array.isArray(data.unlockedWaypoints)) this.unlockedWaypoints = new Set(data.unlockedWaypoints);
      if (Array.isArray(data.collectedAnemoculi)) this.collectedAnemoculi = new Set(data.collectedAnemoculi);
      if (Array.isArray(data.openedChests)) this.openedChests = new Set(data.openedChests);
      if (Array.isArray(data.completedSeelies)) this.completedSeelies = new Set(data.completedSeelies);
      if (Array.isArray(data.completedPuzzles)) this.completedPuzzles = new Set(data.completedPuzzles);
      if (Array.isArray(data.completedChallenges)) this.completedChallenges = new Set(data.completedChallenges);
      if (typeof data.domainClears === 'number') this.domainClears = data.domainClears;
      if (typeof data.bossDefeatedCount === 'number') this.bossDefeatedCount = data.bossDefeatedCount;
      if (typeof data.wishPity4 === 'number') this.wishPity4 = data.wishPity4;
      if (typeof data.wishPity5 === 'number') this.wishPity5 = data.wishPity5;
      if (data.inventoryCounts) {
        for (const [k, cnt] of Object.entries(data.inventoryCounts)) {
          if (this.inventory[k] && typeof cnt === 'number') {
            this.inventory[k].count = cnt;
          }
        }
      }
      this.syncQuestFromCounts();
    } catch {
      // Ignore
    }
  }

  private syncQuestFromCounts(): void {
    const map: Record<string, number> = {
      q_statue: this.statueResonated ? 1 : 0,
      q_seelie: this.completedSeelies.size + this.completedPuzzles.size,
      q_waypoints: this.unlockedWaypoints.size,
      q_oculi: this.collectedAnemoculi.size,
      q_boss: this.bossDefeatedCount > 0 ? 1 : 0,
      q_domain: this.domainClears,
      q_chests: this.openedChests.size,
    };
    for (const q of this.quests) {
      q.current = Math.min(q.target, map[q.id] ?? 0);
      q.completed = q.current >= q.target;
    }
  }

  public resetSave(): void {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('genshin_clone_save_v1');
    window.location.reload();
  }
}
