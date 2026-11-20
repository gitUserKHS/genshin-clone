import * as THREE from 'three';
import { Noise2D } from '../core/Noise';
import type { CylinderCollider, GraphicsQuality } from '../core/Types';
import { getTerrainHeight, getTerrainNormal, isOnRoad, WATER_Y, WORLD_LANDMARKS } from './Terrain';

let sharedToonMap: THREE.DataTexture | null = null;

/**
 * Shared 4-step anime cel-shading gradient map using safe 4-byte RGBAFormat.
 */
export function createToonGradientMap(): THREE.DataTexture {
  if (sharedToonMap) return sharedToonMap;
  const data = new Uint8Array([
    98, 98, 112, 255,
    164, 164, 176, 255,
    222, 222, 228, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  sharedToonMap = tex;
  return tex;
}

const GRASS_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform vec3 uPlayerPos;
uniform float uWindStrength;

varying vec2 vUv;
varying vec3 vColor;
varying float vDist;

void main() {
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(0.32, 0.68, 0.28);
  #endif

  vec4 worldBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 localPos = vec4(position, 1.0);
  vec4 worldPos = instanceMatrix * localPos;

  float bendFactor = uv.y * uv.y;
  float wave = sin(worldBase.x * 0.13 + worldBase.z * 0.11 + uTime * 2.3) * 0.25
             + cos(worldBase.x * 0.26 - worldBase.z * 0.21 + uTime * 3.2) * 0.10;
  worldPos.x += wave * bendFactor * uWindStrength;
  worldPos.z += wave * 0.55 * bendFactor * uWindStrength;

  // Player push-away
  vec2 toPlayer = worldPos.xz - uPlayerPos.xz;
  float pDist = length(toPlayer);
  float pushRadius = 2.0;
  if (pDist < pushRadius && abs(worldPos.y - uPlayerPos.y) < 2.2) {
    float strength = (1.0 - pDist / pushRadius) * bendFactor * 1.15;
    vec2 pushDir = pDist > 0.001 ? normalize(toPlayer) : vec2(1.0, 0.0);
    worldPos.xz += pushDir * strength;
    worldPos.y -= strength * 0.26;
  }

  vDist = length(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const GRASS_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec2 vUv;
varying vec3 vColor;
varying float vDist;

void main() {
  float alphaFade = 1.0 - smoothstep(88.0, 136.0, vDist);
  if (alphaFade < 0.04) discard;

  vec3 rootCol = vColor * 0.56;
  vec3 tipCol = mix(vColor * 1.18, uSunColor * vec3(0.75, 0.98, 0.45), 0.26);
  vec3 col = mix(rootCol, tipCol, smoothstep(0.0, 1.0, vUv.y));

  float fogFactor = 1.0 - exp(-pow(vDist * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

  gl_FragColor = vec4(col, alphaFade);
}
`;

export class FoliageSystem {
  public readonly colliders: CylinderCollider[] = [];
  private grassMesh: THREE.InstancedMesh;
  private wildflowerMesh: THREE.InstancedMesh;
  private grassUniforms: {
    uTime: { value: number };
    uPlayerPos: { value: THREE.Vector3 };
    uWindStrength: { value: number };
    uSunColor: { value: THREE.Color };
    uFogColor: { value: THREE.Color };
    uFogDensity: { value: number };
  };
  private readonly maxGrassCount = 26000;
  private windriseMotes: THREE.Points;
  private motePositions: Float32Array;
  private ambientPetals: THREE.Points;
  private petalOffsets: Float32Array;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    const toonMap = createToonGradientMap();

    this.grassUniforms = {
      uTime: { value: 0 },
      uPlayerPos: { value: new THREE.Vector3() },
      uWindStrength: { value: 1.0 },
      uSunColor: { value: new THREE.Color(0xfff5de) },
      uFogColor: { value: new THREE.Color(0xbce8ff) },
      uFogDensity: { value: 0.0038 },
    };

    this.grassMesh = this.createGrassInstances();
    scene.add(this.grassMesh);

    this.wildflowerMesh = this.createWildflowerInstances();
    scene.add(this.wildflowerMesh);

    this.createInstancedTrees(scene, toonMap);
    this.createBoulders(scene, toonMap);
    this.createWindriseGreatOak(scene, toonMap);

    const { points, positions } = this.createWindriseMotes();
    this.windriseMotes = points;
    this.motePositions = positions;
    scene.add(this.windriseMotes);

    const petals = this.createAmbientPetals();
    this.ambientPetals = petals.points;
    this.petalOffsets = petals.offsets;
    scene.add(this.ambientPetals);
  }

  public setQuality(quality: GraphicsQuality): void {
    if (quality === 'low') {
      this.grassMesh.count = 7000;
      this.wildflowerMesh.count = 1000;
    } else if (quality === 'high') {
      this.grassMesh.count = 18000;
      this.wildflowerMesh.count = 2800;
    } else {
      this.grassMesh.count = 26000;
      this.wildflowerMesh.count = 4000;
    }
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    sunColor: THREE.Color,
    fogColor: THREE.Color,
    fogDensity: number,
  ): void {
    this.elapsed += dt;
    this.grassUniforms.uTime.value = this.elapsed;
    this.grassUniforms.uPlayerPos.value.copy(playerPos);
    this.grassUniforms.uSunColor.value.copy(sunColor);
    this.grassUniforms.uFogColor.value.copy(fogColor);
    this.grassUniforms.uFogDensity.value = fogDensity;

    // Windrise glowing emerald motes
    const wx = WORLD_LANDMARKS.windrise.x;
    const wz = WORLD_LANDMARKS.windrise.z;
    const baseY = getTerrainHeight(wx, wz);
    const posAttr = this.windriseMotes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.motePositions.length; i += 3) {
      this.motePositions[i] += Math.sin(this.elapsed * 0.8 + i) * dt * 0.7;
      this.motePositions[i + 1] += dt * 0.85;
      this.motePositions[i + 2] += Math.cos(this.elapsed * 0.7 + i) * dt * 0.7;
      if (this.motePositions[i + 1] > baseY + 23) {
        this.motePositions[i + 1] = baseY + 0.8;
      }
    }
    posAttr.needsUpdate = true;

    // Ambient sunlit dandelion seeds / golden motes drifting around player
    const pAttr = this.ambientPetals.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pAttr.array as Float32Array;
    for (let i = 0; i < this.petalOffsets.length; i += 3) {
      this.petalOffsets[i] += dt * 1.15;
      this.petalOffsets[i + 1] += Math.sin(this.elapsed * 1.4 + i) * dt * 0.45;
      this.petalOffsets[i + 2] += Math.cos(this.elapsed * 0.9 + i) * dt * 0.65;
      if (this.petalOffsets[i] > 22) this.petalOffsets[i] -= 44;
      if (this.petalOffsets[i + 1] > 14) this.petalOffsets[i + 1] = 0.6;
      if (this.petalOffsets[i + 1] < 0.4) this.petalOffsets[i + 1] = 13;
      if (this.petalOffsets[i + 2] > 22) this.petalOffsets[i + 2] -= 44;
      if (this.petalOffsets[i + 2] < -22) this.petalOffsets[i + 2] += 44;

      arr[i] = playerPos.x + this.petalOffsets[i];
      arr[i + 1] = playerPos.y + this.petalOffsets[i + 1];
      arr[i + 2] = playerPos.z + this.petalOffsets[i + 2];
    }
    pAttr.needsUpdate = true;
  }

  private createGrassInstances(): THREE.InstancedMesh {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertOffset = 0;

    for (let b = 0; b < 3; b++) {
      const angle = (b / 3) * Math.PI + 0.2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const w = 0.095;
      const h = 0.78 + (b % 2) * 0.16;
      const ox = (b - 1) * 0.08;
      const oz = ((b % 2) - 0.5) * 0.08;

      positions.push(
        ox - cos * w, 0, oz - sin * w,
        ox + cos * w, 0, oz + sin * w,
        ox - cos * w * 0.6 + sin * 0.06, h * 0.55, oz - sin * w * 0.6 - cos * 0.06,
        ox + cos * w * 0.6 + sin * 0.06, h * 0.55, oz + sin * w * 0.6 - cos * 0.06,
        ox + sin * 0.15, h, oz - cos * 0.15,
      );
      uvs.push(0, 0, 1, 0, 0, 0.55, 1, 0.55, 0.5, 1);

      indices.push(
        vertOffset, vertOffset + 1, vertOffset + 2,
        vertOffset + 1, vertOffset + 3, vertOffset + 2,
        vertOffset + 2, vertOffset + 3, vertOffset + 4,
      );
      vertOffset += 5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.ShaderMaterial({
      vertexShader: GRASS_VERTEX_SHADER,
      fragmentShader: GRASS_FRAGMENT_SHADER,
      uniforms: this.grassUniforms,
      side: THREE.DoubleSide,
      transparent: true,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, this.maxGrassCount);
    mesh.count = 18000;
    mesh.frustumCulled = false;

    const noise = new Noise2D(717);
    const dummy = new THREE.Object3D();
    const normal = new THREE.Vector3();
    const color = new THREE.Color();
    const c1 = new THREE.Color(0x3f9e36);
    const c2 = new THREE.Color(0x6fd444);

    let placed = 0;
    let seed = 123456;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    let attempts = 0;
    while (placed < this.maxGrassCount && attempts < this.maxGrassCount * 5) {
      attempts++;
      const x = (rand() - 0.5) * 340;
      const z = (rand() - 0.5) * 340;
      const y = getTerrainHeight(x, z);
      if (y < WATER_Y + 0.85) continue;
      if (Math.hypot(x, z + 24) < 19.8) continue;
      if (Math.hypot(x + 78, z - 54) < 20) continue;
      if (isOnRoad(x, z) > 0.35) continue;

      getTerrainNormal(x, z, normal);
      if (normal.y < 0.84) continue;

      dummy.position.set(x, y - 0.04, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const scale = 0.8 + rand() * 0.65;
      dummy.scale.set(scale, scale * (0.85 + rand() * 0.45), scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);

      const n = noise.noise2D(x * 0.06, z * 0.06) * 0.5 + 0.5;
      color.copy(c1).lerp(c2, n);
      mesh.setColorAt(placed, color);
      placed++;
    }
    mesh.count = Math.min(18000, placed);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    return mesh;
  }

  private createWildflowerInstances(): THREE.InstancedMesh {
    const geo = new THREE.DodecahedronGeometry(0.14, 0);
    geo.translate(0, 0.38, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const maxCount = 4000;
    const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    mesh.frustumCulled = false;

    const palette = [0xfff078, 0xffffff, 0x9be2ff, 0xffb3cf, 0xffd175];
    const dummy = new THREE.Object3D();
    const normal = new THREE.Vector3();
    const col = new THREE.Color();

    let seed = 80808;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    let placed = 0;
    for (let i = 0; i < 12000 && placed < maxCount; i++) {
      const x = (rand() - 0.5) * 320;
      const z = (rand() - 0.5) * 320;
      const y = getTerrainHeight(x, z);
      if (y < WATER_Y + 1.0) continue;
      if (Math.hypot(x, z + 24) < 20 || Math.hypot(x + 78, z - 54) < 21 || isOnRoad(x, z) > 0.3) continue;
      getTerrainNormal(x, z, normal);
      if (normal.y < 0.87) continue;

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const s = 0.75 + rand() * 0.7;
      dummy.scale.set(s, s * 0.7, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);

      col.setHex(palette[placed % palette.length]);
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = Math.min(2800, placed);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private createInstancedTrees(scene: THREE.Scene, toonMap: THREE.DataTexture): void {
    const oakTrunkGeo = new THREE.CylinderGeometry(0.26, 0.52, 4.0, 7);
    oakTrunkGeo.translate(0, 2.0, 0);
    const oakTrunkMat = new THREE.MeshToonMaterial({ color: 0x6b452d, gradientMap: toonMap });

    const oakCanopyGeo = this.mergeGeometriesSimple([
      new THREE.DodecahedronGeometry(2.15, 1).translate(0, 4.85, 0),
      new THREE.DodecahedronGeometry(1.55, 1).translate(1.25, 4.2, 0.65),
      new THREE.DodecahedronGeometry(1.45, 1).translate(-1.15, 4.3, -0.55),
      new THREE.DodecahedronGeometry(1.35, 1).translate(0.1, 5.75, -0.2),
    ]);
    const oakCanopyMat = new THREE.MeshToonMaterial({ color: 0x4bb64f, gradientMap: toonMap });

    const pineTrunkGeo = new THREE.CylinderGeometry(0.2, 0.44, 4.2, 7);
    pineTrunkGeo.translate(0, 2.1, 0);
    const pineCanopyGeo = this.mergeGeometriesSimple([
      new THREE.ConeGeometry(2.15, 3.0, 7).translate(0, 4.0, 0),
      new THREE.ConeGeometry(1.68, 2.7, 7).translate(0, 5.5, 0),
      new THREE.ConeGeometry(1.15, 2.3, 7).translate(0, 6.9, 0),
    ]);
    const pineCanopyMat = new THREE.MeshToonMaterial({ color: 0x2c824a, gradientMap: toonMap });

    const maxOak = 98;
    const maxPine = 86;
    const oakTrunks = new THREE.InstancedMesh(oakTrunkGeo, oakTrunkMat, maxOak);
    const oakCanopies = new THREE.InstancedMesh(oakCanopyGeo, oakCanopyMat, maxOak);
    const pineTrunks = new THREE.InstancedMesh(pineTrunkGeo, oakTrunkMat, maxPine);
    const pineCanopies = new THREE.InstancedMesh(pineCanopyGeo, pineCanopyMat, maxPine);

    [oakTrunks, oakCanopies, pineTrunks, pineCanopies].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
    });

    let seed = 98765;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const dummy = new THREE.Object3D();
    const normal = new THREE.Vector3();
    const canopyCol = new THREE.Color();

    let oakCount = 0;
    let pineCount = 0;

    for (let attempt = 0; attempt < 1600 && (oakCount < maxOak || pineCount < maxPine); attempt++) {
      const x = (rand() - 0.5) * 330;
      const z = (rand() - 0.5) * 330;
      const y = getTerrainHeight(x, z);
      if (y < WATER_Y + 1.2) continue;

      if (Math.hypot(x, z - 28) < 13) continue;
      if (Math.hypot(x, z + 24) < 23) continue;
      if (Math.hypot(x - 78, z + 58) < 18) continue;
      if (Math.hypot(x + 78, z - 54) < 25) continue;
      if (Math.hypot(x - 84, z - 58) < 16) continue;
      if (Math.hypot(x + 42, z - 46) < 12) continue; // Domain Gate clearing
      if (isOnRoad(x, z) > 0.2) continue;

      getTerrainNormal(x, z, normal);
      if (normal.y < 0.85) continue;

      const inForest = Math.hypot(x + 92, z + 108) < 58 || z < -70;
      const scale = 0.85 + rand() * 0.65;
      dummy.position.set(x, y - 0.15, z);
      dummy.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, (rand() - 0.5) * 0.08);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();

      if (inForest && pineCount < maxPine) {
        pineTrunks.setMatrixAt(pineCount, dummy.matrix);
        pineCanopies.setMatrixAt(pineCount, dummy.matrix);
        canopyCol.setHex(0x2d8a4e).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.06);
        pineCanopies.setColorAt(pineCount, canopyCol);
        this.colliders.push({ x, z, radius: 0.55 * scale, minY: y - 1, maxY: y + 6 });
        pineCount++;
      } else if (oakCount < maxOak) {
        oakTrunks.setMatrixAt(oakCount, dummy.matrix);
        oakCanopies.setMatrixAt(oakCount, dummy.matrix);
        // Occasional warm golden-autumn Mondstadt accent oak!
        const baseHex = oakCount % 9 === 0 ? 0xe0a23b : 0x52be4e;
        canopyCol.setHex(baseHex).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.07);
        oakCanopies.setColorAt(oakCount, canopyCol);
        this.colliders.push({ x, z, radius: 0.6 * scale, minY: y - 1, maxY: y + 6 });
        oakCount++;
      }
    }

    oakTrunks.count = oakCount;
    oakCanopies.count = oakCount;
    pineTrunks.count = pineCount;
    pineCanopies.count = pineCount;

    [oakTrunks, oakCanopies, pineTrunks, pineCanopies].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      scene.add(m);
    });
  }

  private createBoulders(scene: THREE.Scene, toonMap: THREE.DataTexture): void {
    const geo = new THREE.DodecahedronGeometry(1.5, 0);
    const mat = new THREE.MeshToonMaterial({ color: 0x7e8a92, gradientMap: toonMap });
    const maxRocks = 110;
    const rocks = new THREE.InstancedMesh(geo, mat, maxRocks);
    rocks.castShadow = true;
    rocks.receiveShadow = true;

    let seed = 424242;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let count = 0;

    for (let i = 0; i < 420 && count < maxRocks; i++) {
      const x = (rand() - 0.5) * 340;
      const z = (rand() - 0.5) * 340;
      const y = getTerrainHeight(x, z);
      if (y < WATER_Y + 0.2) continue;
      if (
        Math.hypot(x, z - 28) < 11 ||
        Math.hypot(x, z + 24) < 21 ||
        Math.hypot(x + 42, z - 46) < 11 ||
        isOnRoad(x, z) > 0.25
      ) {
        continue;
      }

      const sx = 0.7 + rand() * 1.6;
      const sy = 0.55 + rand() * 1.1;
      const sz = 0.7 + rand() * 1.5;
      dummy.position.set(x, y + sy * 0.35, z);
      dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      rocks.setMatrixAt(count, dummy.matrix);

      col.setHex(0x7c8a96).offsetHSL(0, 0, (rand() - 0.5) * 0.1);
      rocks.setColorAt(count, col);
      this.colliders.push({ x, z, radius: Math.max(sx, sz) * 1.25, minY: y - 1, maxY: y + sy * 1.8 });
      count++;
    }

    rocks.count = count;
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    scene.add(rocks);
  }

  private createWindriseGreatOak(scene: THREE.Scene, toonMap: THREE.DataTexture): void {
    const wx = WORLD_LANDMARKS.windrise.x;
    const wz = WORLD_LANDMARKS.windrise.z;
    const wy = getTerrainHeight(wx, wz);

    const group = new THREE.Group();
    group.position.set(wx, wy, wz);

    const barkMat = new THREE.MeshToonMaterial({ color: 0x623d28, gradientMap: toonMap });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 3.6, 13, 10), barkMat);
    trunk.position.y = 6.2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.2, 5.2, 6), barkMat);
      root.position.set(Math.cos(a) * 2.8, 1.4, Math.sin(a) * 2.8);
      root.rotation.z = -Math.cos(a) * 0.75;
      root.rotation.x = Math.sin(a) * 0.75;
      root.castShadow = true;
      group.add(root);
    }

    const canopyColors = [0x45b549, 0x56ca52, 0x72db5c, 0x3b9e46];
    const puffOffsets: Array<[number, number, number, number]> = [
      [0, 16.5, 0, 8.2],
      [-5.8, 14.5, 3.2, 6.0],
      [6.1, 14.2, -2.5, 6.2],
      [2.5, 15.0, 5.8, 5.6],
      [-3.2, 14.8, -5.6, 5.8],
      [0, 19.8, 0, 5.4],
      [-7.5, 12.8, -1.5, 4.6],
      [7.2, 13.0, 3.4, 4.8],
    ];

    puffOffsets.forEach(([ox, oy, oz, r], idx) => {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, 7.5, 6), barkMat);
      branch.position.set(ox * 0.45, 10.5, oz * 0.45);
      branch.lookAt(wx + ox, wy + oy, wz + oz);
      branch.rotateX(Math.PI / 2);
      group.add(branch);

      const leafMat = new THREE.MeshToonMaterial({
        color: canopyColors[idx % canopyColors.length],
        gradientMap: toonMap,
      });
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), leafMat);
      puff.position.set(ox, oy, oz);
      puff.scale.y = 0.72;
      puff.castShadow = true;
      puff.receiveShadow = true;
      group.add(puff);
    });

    scene.add(group);
    this.colliders.push({ x: wx, z: wz, radius: 3.1, minY: wy - 1, maxY: wy + 13 });
  }

  private createWindriseMotes(): { points: THREE.Points; positions: Float32Array } {
    const count = 110;
    const positions = new Float32Array(count * 3);
    const wx = WORLD_LANDMARKS.windrise.x;
    const wz = WORLD_LANDMARKS.windrise.z;
    const wy = getTerrainHeight(wx, wz);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 15;
      positions[i * 3] = wx + Math.cos(angle) * dist;
      positions[i * 3 + 1] = wy + 1 + Math.random() * 20;
      positions[i * 3 + 2] = wz + Math.sin(angle) * dist;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x9bffd8,
      size: 0.34,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    return { points, positions };
  }

  private createAmbientPetals(): { points: THREE.Points; offsets: Float32Array } {
    const count = 90;
    const offsets = new Float32Array(count * 3);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      offsets[i * 3] = (Math.random() - 0.5) * 44;
      offsets[i * 3 + 1] = 0.6 + Math.random() * 13;
      offsets[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfff8d6,
      size: 0.16,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, offsets };
  }

  private mergeGeometriesSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    let totalVerts = 0;
    for (const g of nonIndexed) {
      g.computeVertexNormals();
      totalVerts += g.attributes.position.count;
    }

    const posOut = new Float32Array(totalVerts * 3);
    const normOut = new Float32Array(totalVerts * 3);
    let offset = 0;
    for (const g of nonIndexed) {
      const p = g.attributes.position as THREE.BufferAttribute;
      const n = g.attributes.normal as THREE.BufferAttribute;
      posOut.set(p.array as Float32Array, offset * 3);
      normOut.set(n.array as Float32Array, offset * 3);
      offset += p.count;
      g.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normOut, 3));
    return merged;
  }
}
