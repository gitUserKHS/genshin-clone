import type { SoundEngine } from '../audio/SoundEngine';
import { ALL_CHARACTERS, ARTIFACT_SETS, CHARACTERS, WEAPONS } from '../characters/CharacterData';
import {
  ELEMENT_COLORS,
  type ArtifactSetId,
  type CharacterId,
  type GraphicsQuality,
  type ModalPanel,
} from '../core/Types';
import { getCharacterPortrait, getWeaponIcon } from '../systems/PortraitGenerator';
import type { ProgressionSystem } from '../systems/ProgressionSystem';

export interface MenuCallbacks {
  onWeaponEquipped: (charId: CharacterId) => void;
  onPartyChanged: () => void;
  onTimeChanged: (hour: number) => void;
  onQualityChanged: (q: GraphicsQuality) => void;
  onToggleTouchControls: () => boolean;
  isTouchControlsEnabled: () => boolean;
  onStartDomain: () => void;
  onCapturePhoto: () => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export class CharacterMenu {
  public readonly el: HTMLElement;
  private selectedChar: CharacterId = 'traveler';
  private selectedPartySlot = 0;
  private currentQuality: GraphicsQuality = 'high';
  private giftClaimed = false;
  private cookAnimId = 0;
  private cookKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly progression: ProgressionSystem,
    private readonly sound: SoundEngine,
    private readonly callbacks: MenuCallbacks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay panel-modal hidden';
    parent.appendChild(this.el);
  }

  private stopCookingLoop(): void {
    cancelAnimationFrame(this.cookAnimId);
    if (this.cookKeyHandler) {
      window.removeEventListener('keydown', this.cookKeyHandler);
      this.cookKeyHandler = null;
    }
  }

  public open(panel: ModalPanel, currentHour: number): void {
    this.stopCookingLoop();
    this.selectedChar = this.progression.activeCharacterId;
    this.el.classList.remove('hidden', 'photo-overlay-mode');

    if (panel === 'character') this.renderCharacterPanel();
    else if (panel === 'party') this.renderPartyPanel();
    else if (panel === 'bag') this.renderBagPanel();
    else if (panel === 'cooking') this.renderCookingMiniGame();
    else if (panel === 'domain') this.renderDomainModal();
    else if (panel === 'photo') this.renderPhotoMode(currentHour);
    else if (panel === 'time') this.renderTimePanel(currentHour);
    else this.renderPaimonMenu(currentHour);
  }

  public close(): void {
    this.stopCookingLoop();
    this.el.classList.add('hidden');
    this.el.classList.remove('photo-overlay-mode');
  }

  private renderCharacterPanel(): void {
    const def = CHARACTERS[this.selectedChar];
    const rt = this.progression.party[this.selectedChar];
    const stats = this.progression.getComputedStats(this.selectedChar);
    const equipped = WEAPONS[rt.weaponId];
    const currentArtifact = ARTIFACT_SETS[rt.artifactSetId];
    const compatibleWeapons = this.progression.ownedWeapons
      .map((id) => WEAPONS[id])
      .filter((w) => w && w.type === def.weaponType);

    this.el.innerHTML = `
      <div class="panel-card wide">
        <div class="panel-head">
          <div class="char-tabs">
            ${ALL_CHARACTERS.map(
              (id) => `
              <button class="char-tab ${id === this.selectedChar ? 'active' : ''}" data-cid="${id}">
                <img src="${getCharacterPortrait(id)}" alt="${CHARACTERS[id].nameKr}" />
                <span>${CHARACTERS[id].nameKr}</span>
              </button>
            `,
            ).join('')}
          </div>
          <button class="modal-close-btn" type="button">✕ 닫기 (C)</button>
        </div>

        <div class="char-body">
          <div class="char-left">
            <img class="char-big-portrait" src="${getCharacterPortrait(this.selectedChar)}" alt="${def.nameKr}" />
            <h2 style="color:${ELEMENT_COLORS[def.element].css}">${def.nameKr}</h2>
            <div class="char-subtitle">${def.titleKr} · 운명의 자리 ${rt.constellation}돌</div>
            <div class="stat-grid">
              <div><span>레벨</span><b>Lv.${rt.level}</b></div>
              <div><span>HP</span><b>${Math.ceil(rt.hp)} / ${stats.maxHp}</b></div>
              <div><span>공격력</span><b>${stats.atk}</b></div>
              <div><span>치명타 확률</span><b>${Math.round(stats.critRate * 100)}%</b></div>
              <div><span>치명타 피해</span><b>${Math.round(stats.critDmg * 100)}%</b></div>
              <div><span>원소 피해</span><b>+${Math.round(stats.elemDmgBonus * 100)}%</b></div>
            </div>
            <div class="refine-box">
              <div>무기 재련 <b>${rt.weaponRefine}재련 / 5</b></div>
              <button class="refine-btn" type="button" ${rt.weaponRefine >= 5 ? 'disabled' : ''}>
                ⚒ 무기 강화 (수정 ×3 · 10,000 모라)
              </button>
            </div>
          </div>

          <div class="char-right">
            <div class="section-box">
              <h3>보유 스킬</h3>
              <p><b>[E] ${def.skillNameKr}</b><br/>${def.skillDescKr}</p>
              <p><b>[Q] ${def.burstNameKr}</b> (원소 에너지 ${def.burstCost})<br/>${def.burstDescKr}</p>
            </div>

            <div class="section-box">
              <h3>성유물 4세트 · <span style="color:${currentArtifact.colorCss}">${currentArtifact.nameKr}</span></h3>
              <div class="artifact-row">
                ${Object.values(ARTIFACT_SETS)
                  .map(
                    (a) => `
                  <button class="artifact-chip ${a.id === rt.artifactSetId ? 'active' : ''}" data-aid="${a.id}" style="border-color:${a.colorCss}">
                    <b>${a.nameKr.replace(' 4세트', '')}</b>
                    <small>${a.bonusDescKr}</small>
                  </button>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <div class="section-box">
              <h3>장착 무기 · ${equipped?.nameKr ?? ''} (${'★'.repeat(equipped?.rarity ?? 3)})</h3>
              <div class="weapon-grid">
                ${compatibleWeapons
                  .map(
                    (w) => `
                  <button class="weapon-item ${w.id === rt.weaponId ? 'equipped' : ''}" data-wid="${w.id}">
                    <img src="${getWeaponIcon(w.id)}" alt="${w.nameKr}" />
                    <div>
                      <div class="w-name">${w.nameKr}</div>
                      <small>${'★'.repeat(w.rarity)} · 공격력 ${w.baseAtk}</small>
                    </div>
                  </button>
                `,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => this.callbacks.onClose());
    this.el.querySelectorAll('.char-tab').forEach((b) => {
      b.addEventListener('click', () => {
        this.selectedChar = (b as HTMLElement).dataset.cid as CharacterId;
        this.renderCharacterPanel();
      });
    });
    this.el.querySelectorAll('.weapon-item').forEach((b) => {
      b.addEventListener('click', () => {
        const wid = (b as HTMLElement).dataset.wid!;
        this.progression.equipWeapon(this.selectedChar, wid);
        this.callbacks.onWeaponEquipped(this.selectedChar);
        this.renderCharacterPanel();
      });
    });
    this.el.querySelectorAll('.artifact-chip').forEach((b) => {
      b.addEventListener('click', () => {
        const aid = (b as HTMLElement).dataset.aid as ArtifactSetId;
        this.progression.equipArtifactSet(this.selectedChar, aid);
        this.sound.playPickup();
        this.renderCharacterPanel();
      });
    });
    this.el.querySelector('.refine-btn')!.addEventListener('click', () => {
      if (this.progression.refineCharacterWeapon(this.selectedChar)) {
        this.sound.playChestOpen();
        this.callbacks.onNotify(`${CHARACTERS[this.selectedChar].nameKr} 무기 제련 상승!`);
        this.renderCharacterPanel();
      } else {
        this.callbacks.onNotify('수정 덩이 3개와 10,000 모라가 필요합니다.');
      }
    });
  }

  private renderPartyPanel(): void {
    const resonance = this.progression.getResonanceSummary();
    this.el.innerHTML = `
      <div class="panel-card wide">
        <div class="panel-head">
          <h2>👥 파티 편성 (1~4번 슬롯)</h2>
          <button class="modal-close-btn" type="button">✕ 닫기 (L)</button>
        </div>

        <div class="resonance-bar">
          ✦ <b>활성 원소 공명:</b> ${resonance.labelKr}
        </div>

        <div class="party-slots-grid">
          ${this.progression.activeParty
            .map((cid, idx) => {
              const d = CHARACTERS[cid];
              return `
              <button class="party-slot-card ${idx === this.selectedPartySlot ? 'selected' : ''}" data-slot="${idx}">
                <span class="slot-num">슬롯 ${idx + 1}</span>
                <img src="${getCharacterPortrait(cid)}" alt="${d.nameKr}" />
                <b style="color:${ELEMENT_COLORS[d.element].css}">${d.nameKr}</b>
                <small>${ELEMENT_COLORS[d.element].labelKr} · ${d.titleKr.split('·')[0]}</small>
              </button>
            `;
            })
            .join('')}
        </div>

        <h3 style="color:var(--gold-bright); margin:16px 0 10px">전체 보유 캐릭터 (슬롯 ${this.selectedPartySlot + 1}에 배치할 캐릭터 선택)</h3>
        <div class="roster-grid">
          ${ALL_CHARACTERS.map((cid) => {
            const d = CHARACTERS[cid];
            const inParty = this.progression.activeParty.includes(cid);
            return `
              <button class="roster-card ${inParty ? 'in-party' : ''}" data-cid="${cid}">
                <img src="${getCharacterPortrait(cid)}" alt="${d.nameKr}" />
                <div>
                  <b style="color:${ELEMENT_COLORS[d.element].css}">${d.nameKr}</b>
                  <small>${ELEMENT_COLORS[d.element].labelKr} · ${d.altSprint !== 'none' ? '수면 질주 가능' : d.weaponType}</small>
                </div>
                ${inParty ? '<span class="in-party-tag">편성됨</span>' : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => this.callbacks.onClose());
    this.el.querySelectorAll('.party-slot-card').forEach((b) => {
      b.addEventListener('click', () => {
        this.selectedPartySlot = Number((b as HTMLElement).dataset.slot);
        this.renderPartyPanel();
      });
    });
    this.el.querySelectorAll('.roster-card').forEach((b) => {
      b.addEventListener('click', () => {
        const cid = (b as HTMLElement).dataset.cid as CharacterId;
        this.progression.setActivePartySlot(this.selectedPartySlot, cid);
        this.sound.playCharacterSwap();
        this.callbacks.onPartyChanged();
        this.renderPartyPanel();
      });
    });
  }

  private renderBagPanel(): void {
    const items = Object.values(this.progression.inventory);
    const active = this.progression.getActiveCharacter();

    this.el.innerHTML = `
      <div class="panel-card wide">
        <div class="panel-head">
          <h2>🎒 모험가 배낭 및 요리</h2>
          <button class="modal-close-btn" type="button">✕ 닫기 (B)</button>
        </div>

        <div class="bag-top-bar">
          <div>현재 파티원 HP (${CHARACTERS[active.id].nameKr}): <b>${Math.ceil(active.hp)} / ${active.maxHp}</b></div>
          <button class="cook-btn" type="button">🍳 요리 미니게임 시작 (달콤달콤꽃 ×2)</button>
        </div>

        <div class="bag-grid">
          ${items
            .map(
              (item) => `
            <div class="bag-slot">
              <div class="bag-slot-head">
                <b>${item.nameKr}</b>
                <span class="bag-count">×${item.count}</span>
              </div>
              <p>${item.descKr}</p>
              ${
                item.isFood && item.count > 0
                  ? `<button class="eat-btn" data-iid="${item.id}" type="button">${item.atkBuffDuration ? '버프 섭취' : '사용하여 회복'}</button>`
                  : ''
              }
            </div>
          `,
            )
            .join('')}
        </div>
      </div>
    `;

    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => this.callbacks.onClose());
    this.el.querySelector('.cook-btn')!.addEventListener('click', () => this.renderCookingMiniGame());
    this.el.querySelectorAll('.eat-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const iid = (b as HTMLElement).dataset.iid!;
        const res = this.progression.consumeFood(iid);
        if (res.buffed) {
          this.sound.playChestOpen();
          this.callbacks.onNotify('선도장 섭취! 60초간 공격력 +30%, 치명타 확률 +12%');
          this.renderBagPanel();
        } else if (res.healed > 0) {
          this.sound.playPickup();
          this.callbacks.onNotify(`HP +${res.healed} 회복!`);
          this.renderBagPanel();
        }
      });
    });
  }

  private renderCookingMiniGame(): void {
    const flowerCount = this.progression.inventory.sweet_flower?.count ?? 0;
    this.el.innerHTML = `
      <div class="panel-card medium">
        <div class="panel-head">
          <h2>🍳 티바트 요리 미니게임</h2>
          <button class="modal-close-btn" type="button">✕ 닫기</button>
        </div>
        <p style="text-align:center;color:#d6def2">황금색 구간에 바늘이 들어왔을 때 <b>조리 완료</b>를 누르면<br/><b>「맛있는 달콤달콤 닭고기 스튜 (HP +6,800)」</b>가 완성됩니다!</p>
        <div style="text-align:center;margin-bottom:14px">보유 달콤달콤꽃: <b>${flowerCount}개</b> (2개 소모)</div>

        <div class="cook-gauge-track">
          <div class="cook-sweet-zone"></div>
          <div class="cook-needle"></div>
        </div>

        <div class="cook-result-msg" style="text-align:center;min-height:24px;margin:14px 0;font-weight:700"></div>
        <div style="display:flex;justify-content:center;gap:12px">
          <button class="cook-stop-btn" type="button" ${flowerCount < 2 ? 'disabled' : ''}>🔥 조리 멈추기!</button>
          <button class="cook-bag-btn" type="button">배낭으로 돌아가기</button>
        </div>
      </div>
    `;

    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => this.callbacks.onClose());
    this.el.querySelector('.cook-bag-btn')!.addEventListener('click', () => {
      this.stopCookingLoop();
      this.renderBagPanel();
    });

    const needle = this.el.querySelector('.cook-needle') as HTMLElement;
    const msgEl = this.el.querySelector('.cook-result-msg') as HTMLElement;
    const stopBtn = this.el.querySelector('.cook-stop-btn') as HTMLButtonElement;
    let pos = 0;
    let dir = 1;
    let locked = false;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      pos += dir * dt * 1.45;
      if (pos >= 1) {
        pos = 1;
        dir = -1;
      } else if (pos <= 0) {
        pos = 0;
        dir = 1;
      }
      needle.style.left = `${pos * 100}%`;
      this.cookAnimId = requestAnimationFrame(tick);
    };
    this.cookAnimId = requestAnimationFrame(tick);

    const doStop = () => {
      if (locked || stopBtn.disabled) return;
      locked = true;
      this.stopCookingLoop();
      const perfect = pos >= 0.42 && pos <= 0.62;
      if (this.progression.cookResult(perfect)) {
        if (perfect) {
          this.sound.playChestOpen();
          msgEl.style.color = '#ffd45c';
          msgEl.textContent = '★ 대성공! 맛있는 달콤달콤 닭고기 스튜 완성!';
        } else {
          this.sound.playPickup();
          msgEl.style.color = '#8bf27e';
          msgEl.textContent = '달콤달콤 닭고기 스튜 완성!';
        }
        setTimeout(() => {
          if (!this.el.classList.contains('hidden')) {
            this.renderCookingMiniGame();
          }
        }, 700);
      }
    };

    stopBtn.addEventListener('click', doStop);
    this.cookKeyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        doStop();
      }
    };
    window.addEventListener('keydown', this.cookKeyHandler);
  }

  private renderDomainModal(): void {
    this.el.innerHTML = `
      <div class="panel-card medium">
        <div class="panel-head">
          <h2>⛩ 비경 · 바람의 시련</h2>
          <button class="modal-close-btn" type="button">✕ 닫기</button>
        </div>
        <div class="section-box">
          <h3>시련 구성 (제한 시간 120초)</h3>
          <p>• <b>웨이브 1:</b> 4원소 슬라임 군단<br/>• <b>웨이브 2:</b> 츄츄족 정예 & 불·얼음 심연 메이지<br/>• <b>웨이브 3:</b> 비경 유적 가디언 & 물 심연 메이지</p>
        </div>
        <div class="section-box">
          <h3>클리어 보상</h3>
          <p>✦ 원석 <b>+240</b> · ◈ 모라 <b>+25,000</b> · 🍖 ★5 <b>선도장 ×1</b> · 모험 경험치 +420</p>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:12px">
          <button class="modal-close-btn cancel-dom" type="button">취소</button>
          <button class="wish-btn gold start-dom-btn" type="button" style="min-width:170px">⚔ 시련 도전 시작</button>
        </div>
      </div>
    `;

    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => this.callbacks.onClose());
    this.el.querySelector('.cancel-dom')!.addEventListener('click', () => this.callbacks.onClose());
    this.el.querySelector('.start-dom-btn')!.addEventListener('click', () => {
      this.callbacks.onClose();
      this.callbacks.onStartDomain();
    });
  }

  private renderPhotoMode(currentHour: number): void {
    this.el.classList.add('photo-overlay-mode');
    this.el.innerHTML = `
      <div class="photo-toolbar">
        <span>📷 사진 모드 (HUD 숨김)</span>
        <button data-h="6.3" type="button">🌅 새벽</button>
        <button data-h="11.5" type="button">☀️ 낮</button>
        <button data-h="17.4" type="button">🌇 노을</button>
        <button data-h="22.5" type="button">🌙 밤</button>
        <button class="photo-snap-btn" type="button">📸 PNG 저장</button>
        <button class="modal-close-btn" type="button">✕ 종료 (P)</button>
      </div>
    `;

    this.el.querySelectorAll('[data-h]').forEach((b) => {
      b.addEventListener('click', () => this.callbacks.onTimeChanged(parseFloat((b as HTMLElement).dataset.h!)));
    });
    this.el.querySelector('.photo-snap-btn')!.addEventListener('click', () => this.callbacks.onCapturePhoto());
    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => this.callbacks.onClose());
  }

  private renderTimePanel(currentHour: number): void {
    const fmt = (h: number) => {
      const hh = Math.floor(h) % 24;
      const mm = Math.floor((h % 1) * 60);
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };

    this.el.innerHTML = `
      <div class="panel-card medium">
        <div class="panel-head">
          <h2>🕒 시간 돌리기</h2>
          <button class="modal-close-btn" type="button">✕ 닫기 (T)</button>
        </div>
        <div class="time-display">현재 시각: <b class="time-val">${fmt(currentHour)}</b></div>
        <input class="time-slider" type="range" min="0" max="23.9" step="0.1" value="${currentHour.toFixed(1)}" />
        <div class="time-presets">
          <button data-h="6.2" type="button">🌅 새벽 (06:12)</button>
          <button data-h="12.0" type="button">☀️ 한낮 (12:00)</button>
          <button data-h="17.5" type="button">🌇 노을 (17:30)</button>
          <button data-h="22.5" type="button">🌙 별밤 (22:30)</button>
        </div>
      </div>
    `;

    const slider = this.el.querySelector('.time-slider') as HTMLInputElement;
    const valEl = this.el.querySelector('.time-val')!;
    slider.addEventListener('input', () => {
      const h = parseFloat(slider.value);
      valEl.textContent = fmt(h);
      this.callbacks.onTimeChanged(h);
    });
    this.el.querySelectorAll('.time-presets button').forEach((b) => {
      b.addEventListener('click', () => {
        const h = parseFloat((b as HTMLElement).dataset.h!);
        slider.value = String(h);
        valEl.textContent = fmt(h);
        this.callbacks.onTimeChanged(h);
      });
    });
    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => this.callbacks.onClose());
  }

  private renderPaimonMenu(currentHour: number): void {
    const vols = this.sound.getVolumes();
    this.el.innerHTML = `
      <div class="panel-card medium">
        <div class="panel-head">
          <h2>✦ 페이몬 메뉴 · 설정</h2>
          <button class="modal-close-btn" type="button">✕ 게임으로 돌아가기 (Esc)</button>
        </div>

        <div class="paimon-stats">
          <div><b>모험 등급:</b> AR ${this.progression.adventureRank}</div>
          <div><b>탐험도:</b> ${this.progression.getExplorationPercent()}%</div>
          <div><b>보유 원석:</b> ✦ ${this.progression.primogems.toLocaleString()}</div>
          <div><b>현재 시각:</b> ${Math.floor(currentHour)}시</div>
        </div>

        <div class="section-box">
          <h3>그래픽 품질</h3>
          <div class="quality-row">
            <button data-q="low" class="${this.currentQuality === 'low' ? 'active' : ''}" type="button">낮음 (7K 잔디)</button>
            <button data-q="high" class="${this.currentQuality === 'high' ? 'active' : ''}" type="button">높음 (18K 잔디)</button>
            <button data-q="ultra" class="${this.currentQuality === 'ultra' ? 'active' : ''}" type="button">울트라 (26K + Bloom)</button>
          </div>
        </div>

        <div class="section-box">
          <h3>오디오 볼륨</h3>
          <label class="vol-row">BGM <input class="bgm-vol" type="range" min="0" max="1" step="0.05" value="${vols.bgm}" /></label>
          <label class="vol-row">SFX <input class="sfx-vol" type="range" min="0" max="1" step="0.05" value="${vols.sfx}" /></label>
        </div>

        <div class="section-box">
          <h3>조작 & 화면 모드</h3>
          <div class="quality-row">
            <button class="touch-toggle-btn ${this.callbacks.isTouchControlsEnabled() ? 'active' : ''}" type="button">
              📱 모바일 터치 조작: ${this.callbacks.isTouchControlsEnabled() ? 'ON' : 'OFF'}
            </button>
            <button class="fullscreen-btn" type="button">⛶ 전체화면 전환</button>
          </div>
        </div>

        <div class="menu-footer-actions">
          <button class="gift-btn" type="button" ${this.giftClaimed ? 'disabled' : ''}>🎁 모험가 보급 우편 (+1,600 원석)</button>
          <button class="reset-btn" type="button">⚠ 새 게임 초기화</button>
        </div>
      </div>
    `;

    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => this.callbacks.onClose());
    this.el.querySelector('.touch-toggle-btn')!.addEventListener('click', () => {
      const next = this.callbacks.onToggleTouchControls();
      this.callbacks.onNotify(`모바일 터치 조작 ${next ? '활성화' : '비활성화'}`);
      this.renderPaimonMenu(currentHour);
    });
    this.el.querySelector('.fullscreen-btn')!.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });
    this.el.querySelectorAll('.quality-row button').forEach((b) => {
      b.addEventListener('click', () => {
        const q = (b as HTMLElement).dataset.q as GraphicsQuality;
        this.currentQuality = q;
        this.callbacks.onQualityChanged(q);
        this.renderPaimonMenu(currentHour);
      });
    });

    const bgmInput = this.el.querySelector('.bgm-vol') as HTMLInputElement;
    const sfxInput = this.el.querySelector('.sfx-vol') as HTMLInputElement;
    const updateAudio = () => {
      this.sound.setVolumes(vols.master, parseFloat(bgmInput.value), parseFloat(sfxInput.value));
    };
    bgmInput.addEventListener('input', updateAudio);
    sfxInput.addEventListener('input', updateAudio);

    this.el.querySelector('.gift-btn')!.addEventListener('click', () => {
      if (this.giftClaimed) return;
      this.giftClaimed = true;
      this.progression.addPrimogems(1600);
      this.sound.playChestOpen();
      this.callbacks.onNotify('우편 보급: 원석 +1,600 획득!');
      this.renderPaimonMenu(currentHour);
    });

    this.el.querySelector('.reset-btn')!.addEventListener('click', () => {
      this.progression.resetSave();
    });
  }
}
