import { getTerrainHeight, isOnRoad, WATER_Y, WORLD_LANDMARKS, WORLD_SIZE } from '../world/Terrain';
import type { EnemySnapshot } from '../core/Types';
import type { WorldInteractables } from '../world/WorldInteractables';

export function buildTerrainMapCanvas(size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py++) {
    const wz = ((py / size) - 0.5) * WORLD_SIZE;
    for (let px = 0; px < size; px++) {
      const wx = ((px / size) - 0.5) * WORLD_SIZE;
      const h = getTerrainHeight(wx, wz);
      const road = isOnRoad(wx, wz);
      const idx = (py * size + px) * 4;

      let r = 88;
      let g = 148;
      let b = 82;

      if (h < WATER_Y) {
        const depth = Math.min(1, (WATER_Y - h) / 4.5);
        r = Math.round(48 - depth * 18);
        g = Math.round(145 - depth * 45);
        b = Math.round(188 - depth * 35);
      } else {
        const contour = Math.sin(h * 1.15) * 8;
        const elev = Math.min(1, Math.max(0, (h + 2) / 28));
        r = Math.round(82 + elev * 58 + contour);
        g = Math.round(148 + elev * 28 + contour);
        b = Math.round(78 + elev * 32 + contour);

        if (road > 0.25) {
          r = Math.round(r * (1 - road * 0.6) + 195 * (road * 0.6));
          g = Math.round(g * (1 - road * 0.6) + 170 * (road * 0.6));
          b = Math.round(b * (1 - road * 0.6) + 122 * (road * 0.6));
        }

        // Stone plazas
        if (Math.hypot(wx, wz + 24) < 12 || Math.hypot(wx + 78, wz - 54) < 18) {
          r = 186;
          g = 192;
          b = 200;
        }
      }

      data[idx] = Math.max(0, Math.min(255, r));
      data[idx + 1] = Math.max(0, Math.min(255, g));
      data[idx + 2] = Math.max(0, Math.min(255, b));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export class Minimap {
  public readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  public readonly baseMapCanvas: HTMLCanvasElement;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 160;
    this.canvas.height = 160;
    this.canvas.className = 'minimap-canvas';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.baseMapCanvas = buildTerrainMapCanvas(512);
  }

  public update(
    playerX: number,
    playerZ: number,
    cameraYaw: number,
    playerFacing: number,
    interactables: WorldInteractables,
    enemies: EnemySnapshot[],
  ): void {
    const ctx = this.ctx;
    const size = 160;
    const half = size / 2;
    const zoomPixelsPerMeter = 1.65;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 3, 0, Math.PI * 2);
    ctx.clip();

    // Draw scaled terrain map centered on player
    const mapSize = this.baseMapCanvas.width;
    const px = ((playerX / WORLD_SIZE) + 0.5) * mapSize;
    const pz = ((playerZ / WORLD_SIZE) + 0.5) * mapSize;
    const mapPixelsPerMeter = mapSize / WORLD_SIZE;
    const drawScale = zoomPixelsPerMeter / mapPixelsPerMeter;

    ctx.drawImage(
      this.baseMapCanvas,
      half - px * drawScale,
      half - pz * drawScale,
      mapSize * drawScale,
      mapSize * drawScale,
    );

    const toMini = (wx: number, wz: number) => ({
      x: half + (wx - playerX) * zoomPixelsPerMeter,
      y: half + (wz - playerZ) * zoomPixelsPerMeter,
    });

    // Draw Statue of The Seven
    const st = toMini(WORLD_LANDMARKS.statue.x, WORLD_LANDMARKS.statue.z);
    ctx.fillStyle = '#52ffe0';
    ctx.beginPath();
    ctx.arc(st.x, st.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#12202f';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw Waypoints
    for (const wp of interactables.waypoints) {
      const p = toMini(wp.x, wp.z);
      ctx.fillStyle = wp.unlocked ? '#5ce4ff' : '#ff6b6b';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x + 4, p.y);
      ctx.lineTo(p.x, p.y + 5);
      ctx.lineTo(p.x - 4, p.y);
      ctx.closePath();
      ctx.fill();
    }

    // Nearby Anemoculi within 58m (4-point star)
    for (const oc of interactables.anemoculi) {
      if (oc.collected) continue;
      if (Math.hypot(oc.x - playerX, oc.z - playerZ) > 58) continue;
      const p = toMini(oc.x, oc.z);
      ctx.fillStyle = '#9effea';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nearby unopened visible chests within 45m
    for (const ch of interactables.chests) {
      if (ch.opened || ch.hiddenUntilUnlocked) continue;
      if (Math.hypot(ch.x - playerX, ch.z - playerZ) > 45) continue;
      const p = toMini(ch.x, ch.z);
      ctx.fillStyle = '#ffd56b';
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    }

    // Aggroed or nearby enemies
    for (const e of enemies) {
      if (Math.hypot(e.worldPos.x - playerX, e.worldPos.z - playerZ) > 46) continue;
      const p = toMini(e.worldPos.x, e.worldPos.z);
      ctx.fillStyle = e.isBoss ? '#ff3b3b' : '#ff6b54';
      ctx.beginPath();
      ctx.arc(p.x, p.y, e.isBoss ? 4.8 : 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Camera view cone
    const viewDirX = -Math.sin(cameraYaw);
    const viewDirZ = -Math.cos(cameraYaw);
    const viewAngle = Math.atan2(viewDirZ, viewDirX);
    const coneGrad = ctx.createRadialGradient(half, half, 2, half, half, 42);
    coneGrad.addColorStop(0, 'rgba(255, 244, 190, 0.42)');
    coneGrad.addColorStop(1, 'rgba(255, 244, 190, 0.0)');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.arc(half, half, 42, viewAngle - 0.5, viewAngle + 0.5);
    ctx.closePath();
    ctx.fill();

    // Player gold arrow
    const fx = Math.sin(playerFacing);
    const fz = Math.cos(playerFacing);
    const rot = Math.atan2(fz, fx);
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(rot + Math.PI / 2);
    ctx.fillStyle = '#fff5c0';
    ctx.strokeStyle = '#1b1d26';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
}
