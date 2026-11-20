import * as THREE from 'three';
import { Noise2D } from '../core/Noise';
import type { WorldPoint } from '../core/Types';

export const WORLD_SIZE = 420;
export const WORLD_HALF = WORLD_SIZE / 2;
export const WATER_Y = -2.2;

export const WORLD_LANDMARKS: Record<string, WorldPoint> = {
  spawn: { id: 'spawn', nameKr: '별이 떨어지는 산기슭', x: 0, z: 28, type: 'landmark' },
  statue: { id: 'statue', nameKr: '별이 떨어지는 골짜기 · 일곱신상', x: 0, z: -24, type: 'statue' },
  windrise: { id: 'windrise', nameKr: '바람이 시작되는 곳', x: 78, z: -58, type: 'waypoint' },
  lake: { id: 'lake', nameKr: '별빛 호수', x: -58, z: -42, type: 'landmark' },
  ruins: { id: 'ruins', nameKr: '속삭임의 유적', x: -78, z: 54, type: 'boss' },
  windmill: { id: 'windmill', nameKr: '몬드 풍차 언덕', x: 84, z: 58, type: 'waypoint' },
  cliff: { id: 'cliff', nameKr: '바람맞이 절벽', x: 12, z: -118, type: 'waypoint' },
  forest: { id: 'forest', nameKr: '속삭이는 숲', x: -92, z: -108, type: 'waypoint' },
};

const ROAD_SEGMENTS: Array<[number, number, number, number]> = [
  [0, 28, 0, -24], // Spawn -> Statue
  [0, -24, 78, -58], // Statue -> Windrise
  [0, -24, 84, 58], // Statue -> Windmill
  [0, 28, -78, 54], // Spawn -> Ruins
  [0, -24, -58, -16], // Statue -> Lake shore
];

const terrainNoise = new Noise2D(4042);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export function isOnRoad(x: number, z: number): number {
  let minD = 999;
  for (let i = 0; i < ROAD_SEGMENTS.length; i++) {
    const [ax, az, bx, bz] = ROAD_SEGMENTS[i];
    const d = distToSegment(x, z, ax, az, bx, bz);
    if (d < minD) minD = d;
  }
  // Subtle natural bend with noise
  const wobble = terrainNoise.noise2D(x * 0.05, z * 0.05) * 1.4;
  return 1.0 - smoothstep(2.4, 5.2, minD + wobble);
}

/**
 * Deterministic heightfield combining Mondstadt rolling hills, cliff ridges,
 * smooth landmark plateaus, carved lake basin, and outer mountain rim.
 */
export function getTerrainHeight(x: number, z: number): number {
  // Base rolling hills
  const n1 = terrainNoise.fbm(x * 0.0085, z * 0.0085, 4, 2.05, 0.48);
  const n2 = terrainNoise.fbm(x * 0.025 + 17.3, z * 0.025 - 9.1, 3, 2.0, 0.5);
  const ridge = terrainNoise.ridged(x * 0.007 + 31.2, z * 0.007 - 12.4, 3);

  let h = n1 * 11.5 + n2 * 2.1 + ridge * 5.2 - 1.2;

  // Gentle terraced plateau look near mid altitudes
  const stepH = Math.floor(h / 5.5) * 5.5 + (h % 5.5);
  h = lerp(h, stepH, 0.15);

  // Outer coastal / mountain ring near world edges (smooth radial falloff)
  const edgeDist = Math.hypot(x, z);
  if (edgeDist > 142) {
    const ringT = smoothstep(142, 205, edgeDist);
    const northWeight = smoothstep(75, -55, z);
    const rimBias = lerp(-5.5, 24, northWeight);
    h += ringT * (rimBias + ridge * 15);
  }

  // 1. Spawn outlook (0, 28) -> y = 5.4
  const dSpawn = Math.hypot(x - 0, z - 28);
  if (dSpawn < 22) {
    h = lerp(h, 5.4, 1 - smoothstep(9, 22, dSpawn));
  }

  // 2. Statue of The Seven (0, -24) -> central plateau y=6.0, ring reflecting pool y=5.15 at r=12..19
  const dStatue = Math.hypot(x - 0, z + 24);
  if (dStatue < 30) {
    const outerBlend = 1 - smoothstep(20, 30, dStatue);
    let statueTarget = 6.0;
    if (dStatue > 11.2 && dStatue < 19.6) {
      // Shallow reflecting pool except on southern stone causeway
      const isCauseway = z > -24 && Math.abs(x) < 3.6;
      if (!isCauseway) {
        const ringT = 1 - Math.abs(dStatue - 15.4) / 4.2;
        statueTarget = 6.0 - 0.85 * Math.max(0, ringT);
      }
    }
    h = lerp(h, statueTarget, outerBlend);
  }

  // 3. Windrise Great Oak (78, -58) -> y = 10.5
  const dWindrise = Math.hypot(x - 78, z + 58);
  if (dWindrise < 34) {
    h = lerp(h, 10.5, 1 - smoothstep(16, 34, dWindrise));
  }

  // 4. Starfell Lake (-58, -42) -> basin dipping to -6.5 with central islet
  const dLake = Math.hypot(x + 58, z + 42);
  if (dLake < 42) {
    const basinT = 1 - smoothstep(16, 42, dLake);
    let lakeTarget = -6.5 + (dLake / 42) * 3.0;
    // Small treasure island in lake center
    if (dLake < 11) {
      lakeTarget = lerp(-0.3, lakeTarget, smoothstep(4.5, 11, dLake));
    }
    h = lerp(h, lakeTarget, basinT);
  }

  // 5. Whispering Ruins Boss Arena (-78, 54) -> flat circular arena y = 8.0
  const dRuins = Math.hypot(x + 78, z - 54);
  if (dRuins < 32) {
    h = lerp(h, 8.0, 1 - smoothstep(18, 32, dRuins));
  }

  // 6. Mondstadt Windmill Hill (84, 58) -> terrace y = 13.5
  const dWindmill = Math.hypot(x - 84, z - 58);
  if (dWindmill < 30) {
    h = lerp(h, 13.5, 1 - smoothstep(14, 30, dWindmill));
  }

  // 7. Stormbearer Cliff (12, -118) -> dramatic high cliff y = 26.5
  const dCliff = Math.hypot(x - 12, z + 118);
  if (dCliff < 40) {
    h = lerp(h, 26.5, 1 - smoothstep(15, 40, dCliff));
  }

  // 8. Whispering Forest (-92, -108) -> gentle plateau y = 11.2
  const dForest = Math.hypot(x + 92, z + 108);
  if (dForest < 32) {
    h = lerp(h, 11.2, 1 - smoothstep(15, 32, dForest));
  }

  return h;
}

export function getTerrainNormal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const eps = 0.45;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  return out.set(hL - hR, 2 * eps, hD - hU).normalize();
}

export function getSurfaceType(x: number, z: number): 'grass' | 'stone' | 'water' | 'sand' {
  const h = getTerrainHeight(x, z);
  if (h < WATER_Y + 0.15) return 'water';
  const dStatue = Math.hypot(x, z + 24);
  if (dStatue < 12.2) return 'stone';
  if (dStatue < 20 && z > -24 && Math.abs(x) < 3.6) return 'stone';
  if (Math.hypot(x + 78, z - 54) < 20) return 'stone';
  if (Math.hypot(x - 84, z - 58) < 13) return 'stone';
  if (h < WATER_Y + 1.4) return 'sand';
  if (isOnRoad(x, z) > 0.45) return 'sand';
  const norm = getTerrainNormal(x, z);
  if (norm.y < 0.78) return 'stone';
  return 'grass';
}

export class Terrain {
  public readonly mesh: THREE.Mesh;

  constructor() {
    const segments = 220;
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const count = posAttr.count;
    const colors = new Float32Array(count * 3);

    const cLushGrass = new THREE.Color(0x5bb848);
    const cSunGrass = new THREE.Color(0x7fd14b);
    const cDeepGrass = new THREE.Color(0x3f9642);
    const cRoad = new THREE.Color(0xd1b379);
    const cSand = new THREE.Color(0xdfcc97);
    const cCliff = new THREE.Color(0x7e8a95);
    const cPlaza = new THREE.Color(0xcbd1d8);
    const tmpColor = new THREE.Color();
    const tmpNormal = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const y = getTerrainHeight(x, z);
      posAttr.setY(i, y);
    }

    geometry.computeVertexNormals();
    const normAttr = geometry.attributes.normal as THREE.BufferAttribute;

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      tmpNormal.set(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));

      const patchNoise = terrainNoise.noise2D(x * 0.04, z * 0.04) * 0.5 + 0.5;
      tmpColor.copy(cLushGrass).lerp(cSunGrass, patchNoise);
      if (y > 14) {
        tmpColor.lerp(cDeepGrass, Math.min(0.65, (y - 14) * 0.04));
      }

      // Dirt path blending
      const road = isOnRoad(x, z);
      if (road > 0.01 && y > WATER_Y + 0.5) {
        tmpColor.lerp(cRoad, road * 0.85);
      }

      // Shoreline sand & shallow bed
      if (y < WATER_Y + 1.55) {
        const sandT = 1 - smoothstep(WATER_Y - 0.6, WATER_Y + 1.55, y);
        tmpColor.lerp(cSand, Math.max(0.2, sandT));
      }

      // Cliff rock shading based on slope
      if (tmpNormal.y < 0.84) {
        const cliffT = smoothstep(0.84, 0.62, tmpNormal.y);
        tmpColor.lerp(cCliff, cliffT);
      }

      // Stone plazas at Statue of The Seven & Whispering Ruins
      const dStatue = Math.hypot(x, z + 24);
      if (dStatue < 12.2 || (dStatue < 20 && z > -24 && Math.abs(x) < 3.6)) {
        tmpColor.lerp(cPlaza, 0.9);
      }
      const dRuins = Math.hypot(x + 78, z - 54);
      if (dRuins < 21) {
        tmpColor.lerp(cCliff, 0.65);
      }

      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const detailTex = this.createPainterlyGroundTexture();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detailTex,
      roughness: 0.92,
      metalness: 0.02,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'TeyvatTerrain';
  }

  private createPainterlyGroundTexture(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, size, size);

    const n = new Noise2D(991);
    const img = ctx.getImageData(0, 0, size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Tileable multi-frequency grain
        const v1 = n.noise2D(Math.sin((x / size) * Math.PI * 2) * 3.5, Math.cos((y / size) * Math.PI * 2) * 3.5);
        const v2 = Math.sin((x * 0.25) + v1 * 2) * Math.cos((y * 0.25) - v1 * 2);
        const shade = Math.max(210, Math.min(255, Math.round(238 + v1 * 14 + v2 * 6)));
        const idx = (y * size + x) * 4;
        data[idx] = shade;
        data[idx + 1] = shade;
        data[idx + 2] = shade;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(48, 48);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
