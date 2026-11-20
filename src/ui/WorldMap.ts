import type { ProgressionSystem } from '../systems/ProgressionSystem';
import { DOMAIN_GATE_POS } from '../world/Landmarks';
import { WORLD_LANDMARKS, WORLD_SIZE } from '../world/Terrain';
import type { WorldInteractables } from '../world/WorldInteractables';

export class WorldMap {
  public readonly el: HTMLElement;
  private selectedPoint: { id: string; nameKr: string; x: number; z: number; unlocked: boolean } | null = null;
  private readonly mapCanvasWrap: HTMLElement;
  private readonly markersLayer: HTMLElement;
  private readonly detailCard: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly playerDot: HTMLElement;

  constructor(
    parent: HTMLElement,
    baseTerrainCanvas: HTMLCanvasElement,
    private readonly progression: ProgressionSystem,
    private readonly interactables: WorldInteractables,
    private readonly onTeleport: (x: number, z: number, label: string) => void,
    private readonly onClose: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay world-map-modal hidden';
    this.el.innerHTML = `
      <div class="map-top-bar">
        <div class="map-title">티바트 · 몬드 지역 월드맵</div>
        <div class="map-stats"></div>
        <button class="modal-close-btn" type="button">✕ 닫기 (M)</button>
      </div>
      <div class="map-body">
        <div class="map-viewport">
          <div class="map-canvas-wrap">
            <div class="map-markers"></div>
            <div class="map-player-dot" title="현재 위치">▲</div>
          </div>
        </div>
        <div class="map-sidebar hidden">
          <div class="map-sel-name"></div>
          <div class="map-sel-desc"></div>
          <button class="map-warp-btn" type="button">✦ 워프 (빠른 이동)</button>
        </div>
      </div>
    `;

    parent.appendChild(this.el);

    this.mapCanvasWrap = this.el.querySelector('.map-canvas-wrap')!;
    this.markersLayer = this.el.querySelector('.map-markers')!;
    this.detailCard = this.el.querySelector('.map-sidebar')!;
    this.statsEl = this.el.querySelector('.map-stats')!;
    this.playerDot = this.el.querySelector('.map-player-dot')!;

    const mapCopy = document.createElement('canvas');
    mapCopy.width = baseTerrainCanvas.width;
    mapCopy.height = baseTerrainCanvas.height;
    mapCopy.className = 'world-map-canvas';
    mapCopy.getContext('2d')!.drawImage(baseTerrainCanvas, 0, 0);
    this.mapCanvasWrap.insertBefore(mapCopy, this.markersLayer);

    this.el.querySelector('.modal-close-btn')!.addEventListener('click', () => this.onClose());
    this.el.querySelector('.map-warp-btn')!.addEventListener('click', () => {
      if (!this.selectedPoint || !this.selectedPoint.unlocked) return;
      this.onTeleport(this.selectedPoint.x, this.selectedPoint.z, this.selectedPoint.nameKr);
      this.onClose();
    });
  }

  public open(playerX: number, playerZ: number): void {
    this.el.classList.remove('hidden');
    this.render(playerX, playerZ);
  }

  public close(): void {
    this.el.classList.add('hidden');
  }

  private render(playerX: number, playerZ: number): void {
    const toPct = (wx: number, wz: number) => ({
      left: `${((wx / WORLD_SIZE) + 0.5) * 100}%`,
      top: `${((wz / WORLD_SIZE) + 0.5) * 100}%`,
    });

    const pPct = toPct(playerX, playerZ);
    this.playerDot.style.left = pPct.left;
    this.playerDot.style.top = pPct.top;

    this.statsEl.innerHTML = `
      <span>탐험도 <b>${this.progression.getExplorationPercent()}%</b></span>
      <span>눈동자 <b>${this.progression.collectedAnemoculi.size}/10</b></span>
      <span>보물상자 <b>${this.progression.openedChests.size}/14</b></span>
      <span>비경 <b>${this.progression.domainClears}회</b></span>
    `;

    this.markersLayer.innerHTML = '';

    // Region names placed cleanly clear of waypoint icons
    const regions = [
      { name: '별이 떨어지는 골짜기', x: 0, z: -36 },
      { name: '바람이 시작되는 곳', x: 78, z: -72 },
      { name: '별빛 호수', x: -58, z: -56 },
      { name: '속삭임의 유적 (BOSS)', x: -84, z: 74 },
      { name: '몬드 풍차 언덕', x: 94, z: 74 },
      { name: '바람맞이 절벽', x: 12, z: -136 },
      { name: '속삭이는 숲', x: -92, z: -126 },
      { name: '비경 · 바람의 시련', x: DOMAIN_GATE_POS.x, z: DOMAIN_GATE_POS.z - 14 },
    ];
    for (const reg of regions) {
      const lbl = document.createElement('div');
      lbl.className = 'map-region-label';
      const pos = toPct(reg.x, reg.z);
      lbl.style.left = pos.left;
      lbl.style.top = pos.top;
      lbl.textContent = reg.name;
      this.markersLayer.appendChild(lbl);
    }

    // Statue marker
    const statuePos = toPct(WORLD_LANDMARKS.statue.x, WORLD_LANDMARKS.statue.z);
    const statueBtn = document.createElement('button');
    statueBtn.type = 'button';
    statueBtn.className = 'map-pin statue-pin';
    statueBtn.style.left = statuePos.left;
    statueBtn.style.top = statuePos.top;
    statueBtn.textContent = '✧';
    statueBtn.title = WORLD_LANDMARKS.statue.nameKr;
    statueBtn.addEventListener('click', () => {
      this.selectPoint({
        id: 'statue',
        nameKr: WORLD_LANDMARKS.statue.nameKr,
        x: WORLD_LANDMARKS.statue.x,
        z: WORLD_LANDMARKS.statue.z + 6,
        unlocked: true,
      });
    });
    this.markersLayer.appendChild(statueBtn);

    // Domain Gate pin (fast travel enabled!)
    const domPos = toPct(DOMAIN_GATE_POS.x, DOMAIN_GATE_POS.z);
    const domBtn = document.createElement('button');
    domBtn.type = 'button';
    domBtn.className = 'map-pin domain-pin';
    domBtn.style.left = domPos.left;
    domBtn.style.top = domPos.top;
    domBtn.textContent = '⛩';
    domBtn.title = '비경 · 바람의 시련';
    domBtn.addEventListener('click', () => {
      this.selectPoint({
        id: 'domain',
        nameKr: '비경 · 바람의 시련',
        x: DOMAIN_GATE_POS.x + 3,
        z: DOMAIN_GATE_POS.z + 3,
        unlocked: true,
      });
    });
    this.markersLayer.appendChild(domBtn);

    // Waypoints
    for (const wp of this.interactables.waypoints) {
      const pos = toPct(wp.x, wp.z);
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = `map-pin wp-pin ${wp.unlocked ? 'unlocked' : 'locked'}`;
      pin.style.left = pos.left;
      pin.style.top = pos.top;
      pin.textContent = '✦';
      pin.title = wp.nameKr;
      pin.addEventListener('click', () => {
        this.selectPoint({
          id: wp.id,
          nameKr: wp.nameKr,
          x: wp.x,
          z: wp.z + 2.5,
          unlocked: wp.unlocked,
        });
      });
      this.markersLayer.appendChild(pin);
    }
  }

  private selectPoint(pt: { id: string; nameKr: string; x: number; z: number; unlocked: boolean }): void {
    this.selectedPoint = pt;
    this.detailCard.classList.remove('hidden');
    (this.detailCard.querySelector('.map-sel-name') as HTMLElement).textContent = pt.nameKr;
    (this.detailCard.querySelector('.map-sel-desc') as HTMLElement).textContent = pt.unlocked
      ? '활성화된 거점입니다. 클릭하여 즉시 워프할 수 있습니다.'
      : '아직 활성화되지 않았습니다. 직접 방문하여 [F] 키로 활성화하세요.';
    const btn = this.detailCard.querySelector('.map-warp-btn') as HTMLButtonElement;
    btn.disabled = !pt.unlocked;
    btn.textContent = pt.unlocked ? '✦ 워프 (빠른 이동)' : '미개방 워프 포인트';
  }
}
