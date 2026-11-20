import * as THREE from 'three';
import { CHARACTERS } from '../characters/CharacterData';
import {
  ELEMENT_COLORS,
  type ActiveChallengeHUD,
  type CharacterId,
  type ElementType,
  type EnemySnapshot,
  type InteractablePrompt,
  type ModalPanel,
} from '../core/Types';
import { getCharacterPortrait } from '../systems/PortraitGenerator';
import type { ProgressionSystem } from '../systems/ProgressionSystem';
import type { WorldInteractables } from '../world/WorldInteractables';
import { Minimap } from './Minimap';

interface FloatingText {
  el: HTMLElement;
  worldPos: THREE.Vector3;
  age: number;
  maxAge: number;
  riseSpeed: number;
  offsetX: number;
}

export class HUD {
  public readonly root: HTMLElement;
  public readonly minimap: Minimap;

  private readonly questBox: HTMLElement;
  private readonly challengeBanner: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossHpFill: HTMLElement;
  private readonly bossAura: HTMLElement;

  private readonly hpLevel: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpTrail: HTMLElement;
  private readonly shieldFill: HTMLElement;
  private readonly statusBadges: HTMLElement;

  private readonly skillBtn: HTMLElement;
  private readonly skillCdEl: HTMLElement;
  private readonly burstBtn: HTMLElement;
  private readonly burstFill: HTMLElement;
  private readonly burstCdEl: HTMLElement;

  private readonly partyList: HTMLElement;
  private partyRows = new Map<CharacterId, HTMLElement>();

  private readonly promptList: HTMLElement;
  private readonly lootFeed: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly burstCutInEl: HTMLElement;
  private readonly sightOverlayEl: HTMLElement;
  private readonly worldLayer: HTMLElement;
  private readonly staminaSvg: SVGSVGElement;
  private readonly staminaArc: SVGPathElement;

  private readonly enemyBars = new Map<string, HTMLElement>();
  private readonly floatingTexts: FloatingText[] = [];
  private hpTrailPercent = 100;
  private readonly onSelectParty: (id: CharacterId) => void;

  private readonly tmpCamForward = new THREE.Vector3();
  private readonly tmpToPoint = new THREE.Vector3();
  private readonly tmpProj = new THREE.Vector3();

  constructor(
    parent: HTMLElement,
    private readonly progression: ProgressionSystem,
    onOpenPanel: (panel: ModalPanel) => void,
    onSelectParty: (id: CharacterId) => void,
    onCastSkill: () => void,
    onCastBurst: () => void,
  ) {
    this.onSelectParty = onSelectParty;
    this.root = document.createElement('div');
    this.root.className = 'hud-root';
    this.root.innerHTML = `
      <div class="sight-overlay hidden"></div>
      <div class="burst-cutin hidden"></div>
      <div class="hud-world-layer"></div>

      <div class="hud-top-left">
        <div class="minimap-frame">
          <div class="minimap-holder"></div>
          <div class="minimap-ring"></div>
        </div>
        <div class="quick-nav">
          <button class="nav-pill" data-panel="menu" title="메뉴 (Esc)">☰<span>Esc</span></button>
          <button class="nav-pill" data-panel="character" title="캐릭터·성유물 (C)">⚔<span>C</span></button>
          <button class="nav-pill" data-panel="party" title="파티 편성 (L)">👥<span>L</span></button>
          <button class="nav-pill" data-panel="bag" title="배낭·요리 (B)">🎒<span>B</span></button>
          <button class="nav-pill" data-panel="map" title="월드맵 (M)">🗺<span>M</span></button>
          <button class="nav-pill wish-pill" data-panel="wish" title="기원 (F3)">✦<span>F3</span></button>
          <button class="nav-pill" data-panel="time" title="시간 (T)">🕒<span>T</span></button>
          <button class="nav-pill" data-panel="photo" title="사진 모드 (P)">📷<span>P</span></button>
        </div>
      </div>

      <div class="hud-top-center">
        <div class="challenge-banner hidden"></div>
        <div class="boss-bar hidden">
          <div class="boss-header">
            <span class="boss-name"></span>
            <span class="boss-aura"></span>
          </div>
          <div class="boss-hp-track"><div class="boss-hp-fill"></div></div>
        </div>
        <div class="quest-tracker"></div>
      </div>

      <div class="hud-top-right-currency">
        <div class="currency-chip">✦ <span class="primo-val">3200</span></div>
        <div class="currency-chip">◈ <span class="mora-val">120,000</span></div>
        <div class="currency-chip ar-chip">AR <span class="ar-val">30</span></div>
      </div>

      <div class="hud-party-list"></div>

      <div class="hud-prompts"></div>
      <div class="hud-loot-feed"></div>
      <div class="hud-toast hidden"></div>

      <div class="hud-bottom-center">
        <div class="status-badges"></div>
        <div class="player-hp-row">
          <span class="player-lv">Lv.90</span>
          <span class="player-hp-text">11400 / 11400</span>
        </div>
        <div class="player-hp-track">
          <div class="player-hp-trail"></div>
          <div class="player-hp-fill"></div>
          <div class="player-shield-fill"></div>
        </div>
      </div>

      <div class="hud-bottom-right">
        <button class="skill-btn" type="button" title="원소 전투 스킬 (E)">
          <span class="skill-icon">E</span>
          <span class="skill-cd hidden"></span>
          <span class="key-cap">E</span>
        </button>
        <button class="burst-btn" type="button" title="원소 폭발 (Q)">
          <div class="burst-liquid"></div>
          <span class="burst-icon">Q</span>
          <span class="burst-cd hidden"></span>
          <span class="key-cap">Q</span>
        </button>
      </div>

      <div class="hud-controls-hint">
        <span><b>F1</b> 조작 안내</span>
        <span><b>V</b> 원소 시야</span>
        <span><b>H</b> 회복</span>
        <span><b>L</b> 파티 편성</span>
        <span><b>Alt</b> 커서</span>
      </div>
    `;

    parent.appendChild(this.root);

    this.worldLayer = this.root.querySelector('.hud-world-layer')!;
    this.sightOverlayEl = this.root.querySelector('.sight-overlay')!;
    this.burstCutInEl = this.root.querySelector('.burst-cutin')!;
    this.minimap = new Minimap(this.root.querySelector('.minimap-holder')!);

    this.questBox = this.root.querySelector('.quest-tracker')!;
    this.challengeBanner = this.root.querySelector('.challenge-banner')!;
    this.bossBar = this.root.querySelector('.boss-bar')!;
    this.bossName = this.root.querySelector('.boss-name')!;
    this.bossHpFill = this.root.querySelector('.boss-hp-fill')!;
    this.bossAura = this.root.querySelector('.boss-aura')!;

    this.hpLevel = this.root.querySelector('.player-lv')!;
    this.hpText = this.root.querySelector('.player-hp-text')!;
    this.hpFill = this.root.querySelector('.player-hp-fill')!;
    this.hpTrail = this.root.querySelector('.player-hp-trail')!;
    this.shieldFill = this.root.querySelector('.player-shield-fill')!;
    this.statusBadges = this.root.querySelector('.status-badges')!;

    this.skillBtn = this.root.querySelector('.skill-btn')!;
    this.skillCdEl = this.root.querySelector('.skill-cd')!;
    this.burstBtn = this.root.querySelector('.burst-btn')!;
    this.burstFill = this.root.querySelector('.burst-liquid')!;
    this.burstCdEl = this.root.querySelector('.burst-cd')!;

    this.partyList = this.root.querySelector('.hud-party-list')!;
    this.promptList = this.root.querySelector('.hud-prompts')!;
    this.lootFeed = this.root.querySelector('.hud-loot-feed')!;
    this.toastEl = this.root.querySelector('.hud-toast')!;

    const svgNS = 'http://www.w3.org/2000/svg';
    this.staminaSvg = document.createElementNS(svgNS, 'svg');
    this.staminaSvg.setAttribute('viewBox', '0 0 60 60');
    this.staminaSvg.setAttribute('class', 'stamina-arc hidden');
    this.staminaArc = document.createElementNS(svgNS, 'path');
    this.staminaArc.setAttribute('fill', 'none');
    this.staminaArc.setAttribute('stroke-width', '6');
    this.staminaArc.setAttribute('stroke-linecap', 'round');
    this.staminaSvg.appendChild(this.staminaArc);
    this.worldLayer.appendChild(this.staminaSvg);

    this.rebuildPartyList();

    this.root.querySelectorAll('.nav-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = (btn as HTMLElement).dataset.panel as ModalPanel;
        onOpenPanel(panel);
      });
    });

    this.skillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onCastSkill();
    });
    this.burstBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onCastBurst();
    });
  }

  public rebuildPartyList(): void {
    this.partyList.innerHTML = '';
    this.partyRows.clear();

    this.progression.activeParty.forEach((id, idx) => {
      const def = CHARACTERS[id];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'party-row';
      row.innerHTML = `
        <span class="party-burst-ready hidden" style="border-color:${ELEMENT_COLORS[def.element].css}; color:${ELEMENT_COLORS[def.element].css}">✦</span>
        <div class="party-info">
          <div class="party-name">${def.nameKr}</div>
          <div class="party-hp-bar"><div class="party-hp-fill"></div></div>
        </div>
        <div class="party-avatar">
          <img src="${getCharacterPortrait(id)}" alt="${def.nameKr}" />
          <span class="party-key">${idx + 1}</span>
        </div>
      `;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSelectParty(id);
      });
      this.partyList.appendChild(row);
      this.partyRows.set(id, row);
    });
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  public flashElementalSight(): void {
    this.sightOverlayEl.classList.remove('hidden');
    clearTimeout((this.sightOverlayEl as unknown as { _tid?: number })._tid);
    (this.sightOverlayEl as unknown as { _tid?: number })._tid = window.setTimeout(() => {
      this.sightOverlayEl.classList.add('hidden');
    }, 1100);
  }

  public showBurstCutIn(charId: CharacterId): void {
    const def = CHARACTERS[charId];
    const col = ELEMENT_COLORS[def.element].css;
    this.burstCutInEl.style.setProperty('--cutin-color', col);
    this.burstCutInEl.innerHTML = `
      <div class="cutin-band">
        <img src="${getCharacterPortrait(charId)}" alt="${def.nameKr}" />
        <div class="cutin-text">
          <div class="cutin-sub">${def.titleKr}</div>
          <div class="cutin-name">${def.burstNameKr}</div>
        </div>
      </div>
    `;
    this.burstCutInEl.classList.remove('hidden');
    clearTimeout((this.burstCutInEl as unknown as { _tid?: number })._tid);
    (this.burstCutInEl as unknown as { _tid?: number })._tid = window.setTimeout(() => {
      this.burstCutInEl.classList.add('hidden');
    }, 950);
  }

  public showToast(title: string, subtitle?: string): void {
    this.toastEl.innerHTML = `<div class="toast-title">${title}</div>${subtitle ? `<div class="toast-sub">${subtitle}</div>` : ''}`;
    this.toastEl.classList.remove('hidden');
    clearTimeout((this.toastEl as unknown as { _tid?: number })._tid);
    (this.toastEl as unknown as { _tid?: number })._tid = window.setTimeout(() => {
      this.toastEl.classList.add('hidden');
    }, 3200);
  }

  public pushLootNotice(text: string, color = '#ffe49e'): void {
    const item = document.createElement('div');
    item.className = 'loot-item';
    item.style.borderLeftColor = color;
    item.textContent = text;
    this.lootFeed.appendChild(item);
    while (this.lootFeed.children.length > 5) {
      this.lootFeed.removeChild(this.lootFeed.firstChild!);
    }
    setTimeout(() => item.remove(), 3500);
  }

  public spawnDamageNumber(worldPos: THREE.Vector3, amount: number, element: ElementType, isCrit: boolean): void {
    const el = document.createElement('div');
    el.className = `dmg-num${isCrit ? ' dmg-crit' : ''}`;
    el.style.color = ELEMENT_COLORS[element].css;
    el.textContent = isCrit ? `${amount}!` : `${amount}`;
    this.worldLayer.appendChild(el);
    this.floatingTexts.push({
      el,
      worldPos: worldPos.clone(),
      age: 0,
      maxAge: 0.95,
      riseSpeed: isCrit ? 1.5 : 1.15,
      offsetX: (Math.random() - 0.5) * 44,
    });
  }

  public spawnReactionPopup(worldPos: THREE.Vector3, label: string, colorCss: string): void {
    const el = document.createElement('div');
    el.className = 'reaction-pop';
    el.style.color = colorCss;
    el.textContent = label;
    this.worldLayer.appendChild(el);
    this.floatingTexts.push({
      el,
      worldPos: worldPos.clone(),
      age: 0,
      maxAge: 1.15,
      riseSpeed: 1.65,
      offsetX: (Math.random() - 0.5) * 32,
    });
  }

  private isInFrontOfCamera(camera: THREE.PerspectiveCamera, worldPoint: THREE.Vector3): boolean {
    camera.getWorldDirection(this.tmpCamForward);
    this.tmpToPoint.copy(worldPoint).sub(camera.position);
    return this.tmpToPoint.dot(this.tmpCamForward) > 0.1;
  }

  public update(params: {
    dt: number;
    camera: THREE.PerspectiveCamera;
    playerPos: THREE.Vector3;
    cameraYaw: number;
    playerFacing: number;
    stamina: number;
    maxStamina: number;
    interactables: WorldInteractables;
    enemies: EnemySnapshot[];
    prompts: InteractablePrompt[];
    activeChallenge: ActiveChallengeHUD | null;
  }): void {
    const { dt, camera, playerPos, stamina, maxStamina, enemies, prompts, activeChallenge } = params;
    const width = window.innerWidth;
    const height = window.innerHeight;

    (this.root.querySelector('.primo-val') as HTMLElement).textContent =
      this.progression.primogems.toLocaleString();
    (this.root.querySelector('.mora-val') as HTMLElement).textContent =
      this.progression.mora.toLocaleString();
    (this.root.querySelector('.ar-val') as HTMLElement).textContent =
      String(this.progression.adventureRank);

    this.minimap.update(
      playerPos.x,
      playerPos.z,
      params.cameraYaw,
      params.playerFacing,
      params.interactables,
      enemies,
    );

    // Challenge / Domain Banner
    if (activeChallenge) {
      this.challengeBanner.classList.remove('hidden');
      this.challengeBanner.innerHTML = `
        <div class="ch-title">⚔ ${activeChallenge.titleKr} · <b>${Math.ceil(activeChallenge.timeLeft)}초</b></div>
        <div class="ch-desc">${activeChallenge.descKr} (${activeChallenge.progress}/${activeChallenge.target})</div>
      `;
    } else {
      this.challengeBanner.classList.add('hidden');
    }

    // Quest Tracker
    const activeQuest = this.progression.quests.find((q) => !q.completed);
    if (activeQuest) {
      this.questBox.innerHTML = `
        <div class="quest-title">❖ ${activeQuest.titleKr}</div>
        <div class="quest-desc">${activeQuest.descKr} (${activeQuest.current}/${activeQuest.target})</div>
      `;
    } else {
      this.questBox.innerHTML = `
        <div class="quest-title">✦ 몬드 모든 임무 완료!</div>
        <div class="quest-desc">비경 시련 · 기원(F3) · 자유 탐험을 즐기세요</div>
      `;
    }

    // Boss HP Bar
    const boss = enemies.find((e) => e.isBoss && e.aggroed);
    if (boss) {
      this.bossBar.classList.remove('hidden');
      this.bossName.textContent = `${boss.nameKr} · Lv.${boss.level}`;
      this.bossHpFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
      this.bossAura.textContent = boss.petrified
        ? '석화'
        : boss.aura
          ? ELEMENT_COLORS[boss.aura.element].labelKr
          : '';
      this.bossAura.style.color = boss.petrified
        ? '#f5cf64'
        : boss.aura
          ? ELEMENT_COLORS[boss.aura.element].css
          : '#fff';
    } else {
      this.bossBar.classList.add('hidden');
    }

    // Active character HP, Shield & Buff Badges
    const active = this.progression.getActiveCharacter();
    const def = CHARACTERS[active.id];
    const hpPct = (active.hp / active.maxHp) * 100;
    this.hpTrailPercent = THREE.MathUtils.lerp(this.hpTrailPercent, hpPct, dt * 4.5);
    this.hpLevel.textContent = `${def.nameKr} · Lv.${active.level}`;
    this.hpText.textContent = `${Math.ceil(active.hp)} / ${active.maxHp}`;
    this.hpFill.style.width = `${hpPct}%`;
    this.hpTrail.style.width = `${this.hpTrailPercent}%`;

    if (this.progression.shield && this.progression.shield.hp > 0) {
      const shPct = Math.min(100, (this.progression.shield.hp / this.progression.shield.maxHp) * 100);
      this.shieldFill.style.width = `${shPct}%`;
      this.shieldFill.style.background = ELEMENT_COLORS[this.progression.shield.element].css;
    } else {
      this.shieldFill.style.width = '0%';
    }

    const badges: string[] = [];
    if (active.infusionTimer > 0 && active.infusionElement) {
      const ec = ELEMENT_COLORS[active.infusionElement];
      badges.push(`<span class="status-pill" style="border-color:${ec.css};color:${ec.css}">${ec.labelKr} 부여 ${active.infusionTimer.toFixed(1)}s</span>`);
    }
    if (this.progression.shield && this.progression.shield.hp > 0) {
      const sc = ELEMENT_COLORS[this.progression.shield.element];
      badges.push(`<span class="status-pill" style="border-color:${sc.css};color:${sc.css}">🛡 보호막 ${Math.ceil(this.progression.shield.hp)}</span>`);
    }
    if (this.progression.atkBuffTimer > 0) {
      badges.push(`<span class="status-pill" style="border-color:#ffd45c;color:#ffd45c">🍖 선도장 버프 ${Math.ceil(this.progression.atkBuffTimer)}s</span>`);
    }
    this.statusBadges.innerHTML = badges.join('');

    // Skill & Burst buttons
    if (active.skillCd > 0) {
      this.skillCdEl.classList.remove('hidden');
      this.skillCdEl.textContent = active.skillCd.toFixed(1);
      this.skillBtn.classList.add('on-cd');
    } else {
      this.skillCdEl.classList.add('hidden');
      this.skillBtn.classList.remove('on-cd');
    }

    const elemCss = ELEMENT_COLORS[def.element].css;
    const energyRatio = active.energy / active.maxEnergy;
    this.burstFill.style.setProperty('--fill-pct', `${Math.min(100, energyRatio * 100)}%`);
    this.burstFill.style.background = `linear-gradient(180deg, ${elemCss}, #141c30)`;
    if (active.burstCd > 0) {
      this.burstCdEl.classList.remove('hidden');
      this.burstCdEl.textContent = active.burstCd.toFixed(1);
    } else {
      this.burstCdEl.classList.add('hidden');
    }
    this.burstBtn.classList.toggle('burst-ready', energyRatio >= 1 && active.burstCd <= 0);
    this.burstBtn.style.setProperty('--elem-color', elemCss);

    // Party list updates
    for (const id of this.progression.activeParty) {
      const rt = this.progression.party[id];
      const row = this.partyRows.get(id);
      if (!row) continue;
      row.classList.toggle('active', id === active.id);
      row.classList.toggle('dead', !rt.isAlive);
      (row.querySelector('.party-hp-fill') as HTMLElement).style.width = `${(rt.hp / rt.maxHp) * 100}%`;
      const readyIcon = row.querySelector('.party-burst-ready') as HTMLElement;
      readyIcon.classList.toggle('hidden', rt.energy < rt.maxEnergy || !rt.isAlive);
    }

    // Prompts
    this.promptList.innerHTML = '';
    prompts.slice(0, 3).forEach((p, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `prompt-chip${idx === 0 ? ' primary' : ''}`;
      btn.innerHTML = `
        ${idx === 0 ? '<span class="prompt-key">F</span>' : ''}
        <span class="prompt-icon">${p.icon}</span>
        <span class="prompt-label">${p.label}${p.subLabel ? ` <small>${p.subLabel}</small>` : ''}</span>
      `;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        p.action();
      });
      this.promptList.appendChild(btn);
    });

    // Stamina Arc
    const sWorld = playerPos.clone().add(new THREE.Vector3(0, 1.5, 0));
    if (stamina < maxStamina - 0.5 && this.isInFrontOfCamera(camera, sWorld)) {
      this.tmpProj.copy(sWorld).project(camera);
      const sx = (this.tmpProj.x * 0.5 + 0.5) * width + 52;
      const sy = (-this.tmpProj.y * 0.5 + 0.5) * height - 28;
      this.staminaSvg.classList.remove('hidden');
      this.staminaSvg.style.left = `${sx}px`;
      this.staminaSvg.style.top = `${sy}px`;
      const ratio = Math.max(0.01, stamina / maxStamina);
      const startA = -Math.PI * 0.7;
      const endA = startA + Math.PI * 1.4 * ratio;
      const r = 20;
      const x1 = 30 + Math.cos(startA) * r;
      const y1 = 30 + Math.sin(startA) * r;
      const x2 = 30 + Math.cos(endA) * r;
      const y2 = 30 + Math.sin(endA) * r;
      const largeArc = endA - startA > Math.PI ? 1 : 0;
      this.staminaArc.setAttribute('d', `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`);
      this.staminaArc.setAttribute('stroke', ratio < 0.25 ? '#ff5447' : '#f2d95c');
    } else {
      this.staminaSvg.classList.add('hidden');
    }

    // Enemy overhead HP & Shield bars (strictly front-of-camera!)
    const visibleIds = new Set<string>();
    for (const e of enemies) {
      if (e.isBoss) continue;
      const dist = e.worldPos.distanceTo(playerPos);
      if (dist > 34 || (!e.aggroed && e.hp >= e.maxHp && e.shieldHp >= e.shieldMaxHp)) continue;

      const anchor = e.worldPos.clone();
      anchor.y += e.heightOffset;
      if (!this.isInFrontOfCamera(camera, anchor)) continue;

      this.tmpProj.copy(anchor).project(camera);
      const x = (this.tmpProj.x * 0.5 + 0.5) * width;
      const y = (-this.tmpProj.y * 0.5 + 0.5) * height;
      visibleIds.add(e.id);

      let bar = this.enemyBars.get(e.id);
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'enemy-overhead';
        bar.innerHTML = `
          <div class="enemy-aura-badge"></div>
          <div class="enemy-shield-track hidden"><div class="enemy-shield-fill"></div></div>
          <div class="enemy-hp-track"><div class="enemy-hp-fill"></div></div>
        `;
        this.worldLayer.appendChild(bar);
        this.enemyBars.set(e.id, bar);
      }
      bar.style.left = `${x}px`;
      bar.style.top = `${y}px`;
      (bar.querySelector('.enemy-hp-fill') as HTMLElement).style.width = `${(e.hp / e.maxHp) * 100}%`;

      const shTrack = bar.querySelector('.enemy-shield-track') as HTMLElement;
      const shFill = bar.querySelector('.enemy-shield-fill') as HTMLElement;
      if (e.shieldMaxHp > 0 && e.shieldHp > 0 && e.shieldElement) {
        shTrack.classList.remove('hidden');
        shFill.style.width = `${(e.shieldHp / e.shieldMaxHp) * 100}%`;
        shFill.style.background = ELEMENT_COLORS[e.shieldElement].css;
      } else {
        shTrack.classList.add('hidden');
      }

      const auraEl = bar.querySelector('.enemy-aura-badge') as HTMLElement;
      if (e.petrified) {
        auraEl.textContent = '석화';
        auraEl.style.color = '#f5cf64';
      } else if (e.frozen) {
        auraEl.textContent = '빙결';
        auraEl.style.color = '#9cf5ff';
      } else if (e.aura) {
        auraEl.textContent = ELEMENT_COLORS[e.aura.element].labelKr;
        auraEl.style.color = ELEMENT_COLORS[e.aura.element].css;
      } else {
        auraEl.textContent = '';
      }
    }

    for (const [id, bar] of this.enemyBars.entries()) {
      if (!visibleIds.has(id)) {
        bar.remove();
        this.enemyBars.delete(id);
      }
    }

    // Floating combat numbers
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.age += dt;
      ft.worldPos.y += ft.riseSpeed * dt;
      if (ft.age >= ft.maxAge) {
        ft.el.remove();
        this.floatingTexts.splice(i, 1);
        continue;
      }
      if (!this.isInFrontOfCamera(camera, ft.worldPos)) {
        ft.el.style.opacity = '0';
        continue;
      }
      this.tmpProj.copy(ft.worldPos).project(camera);
      const sx = (this.tmpProj.x * 0.5 + 0.5) * width + ft.offsetX;
      const sy = (-this.tmpProj.y * 0.5 + 0.5) * height;
      ft.el.style.left = `${sx}px`;
      ft.el.style.top = `${sy}px`;
      ft.el.style.opacity = String(1 - Math.pow(ft.age / ft.maxAge, 2));
    }
  }
}
