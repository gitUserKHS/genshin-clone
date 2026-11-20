import type { SoundEngine } from '../audio/SoundEngine';
import { ALL_CHARACTERS } from '../characters/CharacterData';
import type { CharacterId } from '../core/Types';
import { getCharacterPortrait, getWeaponIcon } from '../systems/PortraitGenerator';
import type { ProgressionSystem, WishResultItem } from '../systems/ProgressionSystem';

export class WishSystem {
  public readonly el: HTMLElement;
  private readonly primoVal: HTMLElement;
  private readonly pityInfo: HTMLElement;
  private readonly cutsceneCanvas: HTMLCanvasElement;
  private readonly resultsOverlay: HTMLElement;
  private readonly resultsGrid: HTMLElement;

  private animId = 0;

  constructor(
    parent: HTMLElement,
    private readonly progression: ProgressionSystem,
    private readonly sound: SoundEngine,
    private readonly onClose: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay wish-modal hidden';
    this.el.innerHTML = `
      <div class="wish-header">
        <div class="wish-title">✦ 기원 · 별하늘과 자유의 부름</div>
        <div class="wish-currency">
          <span>✦ 원석 <b class="wish-primo">3200</b></span>
          <span class="wish-pity"></span>
          <button class="modal-close-btn" type="button">✕ 닫기 (F3)</button>
        </div>
      </div>

      <div class="wish-banner-card">
        <div class="banner-art">
          <div class="banner-badge">★5 이벤트 기원 · 6원소 전 캐릭터 픽업</div>
          <h2>찬란한 자유의 노래</h2>
          <p>6인 전 캐릭터 운명의 자리 돌파 및 ★5 전설 무기<br/>(매의 검 · 늑대의 말로 · 사풍 원서 · 안개를 가르는 회광 · 호마의 지팡이 · 관홍의 창)</p>
          <div class="banner-portraits">
            ${ALL_CHARACTERS.map((cid) => `<img src="${getCharacterPortrait(cid)}" alt="${cid}" />`).join('')}
          </div>
        </div>
        <div class="wish-actions">
          <button class="wish-btn wish-1" type="button">
            <span>1회 기원</span>
            <small>✦ 160 원석</small>
          </button>
          <button class="wish-btn wish-10 gold" type="button">
            <span>10회 기원</span>
            <small>✦ 1,600 원석</small>
          </button>
        </div>
      </div>

      <canvas class="wish-cutscene hidden"></canvas>
      <div class="wish-results hidden">
        <h3>기원 결과</h3>
        <div class="wish-results-grid"></div>
        <button class="wish-confirm-btn" type="button">확인</button>
      </div>
    `;

    parent.appendChild(this.el);

    this.primoVal = this.el.querySelector('.wish-primo')!;
    this.pityInfo = this.el.querySelector('.wish-pity')!;
    this.cutsceneCanvas = this.el.querySelector('.wish-cutscene')!;
    this.resultsOverlay = this.el.querySelector('.wish-results')!;
    this.resultsGrid = this.el.querySelector('.wish-results-grid')!;

    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => this.onClose());
    this.el.querySelector('.wish-1')!.addEventListener('click', () => this.triggerWish(1));
    this.el.querySelector('.wish-10')!.addEventListener('click', () => this.triggerWish(10));
    this.el.querySelector('.wish-confirm-btn')!.addEventListener('click', () => {
      this.resultsOverlay.classList.add('hidden');
      this.refreshStats();
    });
  }

  public open(): void {
    this.el.classList.remove('hidden');
    this.resultsOverlay.classList.add('hidden');
    this.cutsceneCanvas.classList.add('hidden');
    this.refreshStats();
  }

  public close(): void {
    cancelAnimationFrame(this.animId);
    this.el.classList.add('hidden');
  }

  private refreshStats(): void {
    this.primoVal.textContent = this.progression.primogems.toLocaleString();
    this.pityInfo.textContent = `5★ 천장 ${this.progression.wishPity5}/75 · 4★ 천장 ${this.progression.wishPity4}/10`;
    (this.el.querySelector('.wish-1') as HTMLButtonElement).disabled = this.progression.primogems < 160;
    (this.el.querySelector('.wish-10') as HTMLButtonElement).disabled = this.progression.primogems < 1600;
  }

  private triggerWish(count: 1 | 10): void {
    const items = this.progression.performWish(count);
    if (!items) return;
    this.refreshStats();

    const maxRarity = items.reduce<3 | 4 | 5>((acc, item) => (item.rarity > acc ? item.rarity : acc), 3);
    this.sound.playWishComet(maxRarity);
    this.playMeteorCutscene(maxRarity, () => {
      this.showResults(items);
    });
  }

  private playMeteorCutscene(rarity: 3 | 4 | 5, onDone: () => void): void {
    const canvas = this.cutsceneCanvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.classList.remove('hidden');
    const ctx = canvas.getContext('2d')!;

    const color = rarity === 5 ? '#ffd45c' : rarity === 4 ? '#c77dff' : '#5ebcff';
    const duration = 1550;
    const start = performance.now();
    let skipped = false;

    const finish = () => {
      if (skipped) return;
      skipped = true;
      cancelAnimationFrame(this.animId);
      canvas.classList.add('hidden');
      canvas.removeEventListener('click', finish);
      onDone();
    };
    canvas.addEventListener('click', finish);

    const stars = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 0.8 + Math.random() * 2.2,
    }));

    const frame = (now: number) => {
      if (skipped) return;
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);

      ctx.fillStyle = '#070b1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      const sx = canvas.width * 0.12;
      const sy = canvas.height * 0.18;
      const ex = canvas.width * 0.56;
      const ey = canvas.height * 0.54;
      const flyT = Math.min(1, t / 0.68);
      const cx = sx + (ex - sx) * flyT;
      const cy = sy + (ey - sy) * flyT + Math.sin(flyT * Math.PI) * -70;

      const tailGrad = ctx.createLinearGradient(sx, sy, cx, cy);
      tailGrad.addColorStop(0, 'rgba(255,255,255,0)');
      tailGrad.addColorStop(0.65, color);
      tailGrad.addColorStop(1, '#ffffff');
      ctx.strokeStyle = tailGrad;
      ctx.lineWidth = rarity === 5 ? 12 : 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 35;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(cx, cy, rarity === 5 ? 16 : 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (t > 0.65) {
        const flashT = (t - 0.65) / 0.35;
        ctx.fillStyle = `rgba(255,255,255,${Math.sin(flashT * Math.PI) * 0.92})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (t >= 1) finish();
      else this.animId = requestAnimationFrame(frame);
    };

    this.animId = requestAnimationFrame(frame);
  }

  private showResults(items: WishResultItem[]): void {
    this.resultsGrid.innerHTML = '';
    const sorted = [...items].sort((a, b) => b.rarity - a.rarity);
    for (const item of sorted) {
      const card = document.createElement('div');
      card.className = `wish-card rarity-${item.rarity}`;
      const iconUrl =
        item.kind === 'character'
          ? getCharacterPortrait(item.id as CharacterId)
          : getWeaponIcon(item.id);
      const stars = '★'.repeat(item.rarity);
      card.innerHTML = `
        <img src="${iconUrl}" alt="${item.nameKr}" />
        <div class="wish-card-stars">${stars}</div>
        <div class="wish-card-name">${item.nameKr}</div>
        ${item.isNew ? '<span class="wish-new-tag">NEW</span>' : ''}
      `;
      this.resultsGrid.appendChild(card);
    }
    this.resultsOverlay.classList.remove('hidden');
  }
}
