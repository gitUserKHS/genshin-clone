import * as THREE from 'three';
import type { CylinderCollider, UpdraftVolume } from '../core/Types';
import { createToonGradientMap } from './FoliageSystem';
import { getTerrainHeight, WORLD_LANDMARKS } from './Terrain';

export const DOMAIN_GATE_POS = { x: -42, z: 46 };

const UPDRAFT_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const UPDRAFT_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;

void main() {
  float spiral1 = sin(vUv.x * 18.85 + vUv.y * 10.0 - uTime * 4.5);
  float spiral2 = sin(vUv.x * 12.56 - vUv.y * 14.0 - uTime * 6.0);
  float streak = smoothstep(0.35, 0.95, (spiral1 + spiral2) * 0.5);
  float edgeFade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
  vec3 col = mix(vec3(0.32, 0.92, 0.78), vec3(0.85, 1.0, 0.95), streak);
  gl_FragColor = vec4(col, streak * edgeFade * 0.44);
}
`;

export class Landmarks {
  public readonly colliders: CylinderCollider[] = [];
  public readonly updrafts: UpdraftVolume[] = [];

  private statueCrystal!: THREE.Mesh;
  private statueHalo!: THREE.Mesh;
  private statueOuterRing!: THREE.Mesh;
  private windmillBlades!: THREE.Group;
  private domainPortalMesh!: THREE.Mesh;
  private lanternMats: THREE.MeshStandardMaterial[] = [];
  private updraftTimeUniform = { value: 0 };
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    const toonMap = createToonGradientMap();

    this.buildStatueOfTheSeven(scene, toonMap);
    this.buildWindmillAndVillage(scene, toonMap);
    this.buildWhisperingRuins(scene, toonMap);
    this.buildDomainPortal(scene, toonMap);
    this.buildRoadLanterns(scene, toonMap);
    this.buildUpdraftWindCurrents(scene);
  }

  public update(dt: number, hour = 12): void {
    this.elapsed += dt;
    this.updraftTimeUniform.value = this.elapsed;

    if (this.statueCrystal) {
      this.statueCrystal.rotation.y += dt * 0.95;
      this.statueCrystal.position.y = 7.45 + Math.sin(this.elapsed * 2.1) * 0.25;
    }
    if (this.statueHalo) {
      this.statueHalo.rotation.z -= dt * 0.65;
    }
    if (this.statueOuterRing) {
      this.statueOuterRing.rotation.z += dt * 0.35;
    }
    if (this.windmillBlades) {
      this.windmillBlades.rotation.z -= dt * 0.58;
    }
    if (this.domainPortalMesh) {
      this.domainPortalMesh.rotation.z += dt * 0.7;
    }

    // Road lanterns glow warmly at dusk/night!
    const isDark = hour < 6.5 || hour > 17.5;
    const targetEmissive = isDark ? 2.6 : 0.4;
    for (const mat of this.lanternMats) {
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * Math.min(1, dt * 3);
    }
  }

  private buildStatueOfTheSeven(scene: THREE.Scene, toonMap: THREE.DataTexture): void {
    const sx = WORLD_LANDMARKS.statue.x;
    const sz = WORLD_LANDMARKS.statue.z;
    const sy = getTerrainHeight(sx, sz);

    const group = new THREE.Group();
    group.position.set(sx, sy, sz);

    const stoneMat = new THREE.MeshToonMaterial({ color: 0xd8dfe8, gradientMap: toonMap });
    const darkStoneMat = new THREE.MeshToonMaterial({ color: 0x8995a3, gradientMap: toonMap });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf0c965,
      emissive: 0x6b4e14,
      emissiveIntensity: 0.45,
      metalness: 0.72,
      roughness: 0.3,
    });
    const tealGlowMat = new THREE.MeshStandardMaterial({
      color: 0x62f5cf,
      emissive: 0x3ef0be,
      emissiveIntensity: 2.35,
      roughness: 0.18,
    });

    // Stepped circular stone plaza
    const base1 = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 9.0, 0.65, 28), stoneMat);
    base1.position.y = 0.25;
    base1.receiveShadow = true;
    group.add(base1);

    const base2 = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.4, 0.85, 24), stoneMat);
    base2.position.y = 0.9;
    base2.receiveShadow = true;
    group.add(base2);

    // Ornate glowing Anemo rune rings on plaza floor
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.05, 40), tealGlowMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.6;
    group.add(ring);

    const goldRing = new THREE.Mesh(new THREE.RingGeometry(7.6, 7.85, 40), goldMat);
    goldRing.rotation.x = -Math.PI / 2;
    goldRing.position.y = 0.6;
    group.add(goldRing);

    // Central Archon pedestal & sculpted winged figure
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 2.2, 2.6, 8), darkStoneMat);
    plinth.position.y = 2.4;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    const robe = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.4, 12), stoneMat);
    robe.position.y = 5.1;
    robe.castShadow = true;
    group.add(robe);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.56, 14, 14), stoneMat);
    head.position.y = 6.95;
    group.add(head);

    // Layered sculpted stone wings
    for (const side of [-1, 1]) {
      for (let w = 0; w < 2; w++) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.8 - w * 0.5, 0.72, 0.22), stoneMat);
        wing.position.set(side * (1.65 - w * 0.2), 5.8 - w * 0.65, -0.38);
        wing.rotation.z = side * (0.48 - w * 0.22);
        wing.rotation.y = side * -0.22;
        wing.castShadow = true;
        group.add(wing);
      }
    }

    // Levitating turquoise Anemo crystal & dual golden halos
    this.statueCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 0), tealGlowMat);
    this.statueCrystal.position.set(0, 7.45, 1.15);
    group.add(this.statueCrystal);

    this.statueHalo = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.08, 8, 32), goldMat);
    this.statueHalo.position.set(0, 6.4, -0.4);
    group.add(this.statueHalo);

    this.statueOuterRing = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.05, 8, 36), tealGlowMat);
    this.statueOuterRing.position.set(0, 6.4, -0.4);
    group.add(this.statueOuterRing);

    // 6 fluted Mondstadt colonnade pillars with golden capitals & archway lintels
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const px = Math.cos(a) * 10.2;
      const pz = Math.sin(a) * 10.2;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 4.9, 10), stoneMat);
      pillar.position.set(px, 2.35, pz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      group.add(pillar);

      const baseFoot = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.45, 1.35), darkStoneMat);
      baseFoot.position.set(px, 0.22, pz);
      group.add(baseFoot);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.42, 1.38), goldMat);
      cap.position.set(px, 4.95, pz);
      group.add(cap);

      const orbTop = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), tealGlowMat);
      orbTop.position.set(px, 5.45, pz);
      group.add(orbTop);

      this.colliders.push({ x: sx + px, z: sz + pz, radius: 0.65, minY: sy, maxY: sy + 5.5 });
    }

    // Southern stone bridge balustrades
    for (const side of [-3.35, 3.35]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.35, 14.5), stoneMat);
      post.position.set(side, 0.28, 15.5);
      post.receiveShadow = true;
      group.add(post);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.16, 14.6), goldMat);
      rail.position.set(side, 0.98, 15.5);
      group.add(rail);
    }

    this.colliders.push({ x: sx, z: sz, radius: 2.3, minY: sy, maxY: sy + 9 });
    scene.add(group);
  }

  private buildWindmillAndVillage(scene: THREE.Scene, toonMap: THREE.DataTexture): void {
    const wx = WORLD_LANDMARKS.windmill.x;
    const wz = WORLD_LANDMARKS.windmill.z;
    const wy = getTerrainHeight(wx, wz);

    const group = new THREE.Group();
    group.position.set(wx, wy, wz);

    const plasterMat = new THREE.MeshToonMaterial({ color: 0xf4ead8, gradientMap: toonMap });
    const woodMat = new THREE.MeshToonMaterial({ color: 0x6b452c, gradientMap: toonMap });
    const roofMat = new THREE.MeshToonMaterial({ color: 0xb94a3e, gradientMap: toonMap });
    const sailMat = new THREE.MeshToonMaterial({
      color: 0xfbf7ee,
      gradientMap: toonMap,
      side: THREE.DoubleSide,
    });

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.9, 14.5, 12), plasterMat);
    tower.position.y = 7.1;
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 4.2, 12), roofMat);
    roof.position.y = 16.3;
    roof.castShadow = true;
    group.add(roof);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.25, 0.55, 12), woodMat);
    band.position.y = 11.2;
    group.add(band);

    this.windmillBlades = new THREE.Group();
    this.windmillBlades.position.set(0, 12.6, 3.25);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.3, 10), woodMat);
    hub.rotation.x = Math.PI / 2;
    this.windmillBlades.add(hub);

    for (let i = 0; i < 4; i++) {
      const armGroup = new THREE.Group();
      armGroup.rotation.z = (i * Math.PI) / 2 + 0.35;

      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 9.2, 0.28), woodMat);
      spar.position.y = 4.6;
      spar.castShadow = true;
      armGroup.add(spar);

      const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 7.2), sailMat);
      sail.position.set(1.15, 5.2, 0.05);
      sail.castShadow = true;
      armGroup.add(sail);

      this.windmillBlades.add(armGroup);
    }
    group.add(this.windmillBlades);
    this.colliders.push({ x: wx, z: wz, radius: 4.1, minY: wy, maxY: wy + 16 });

    const cottageOffsets: Array<[number, number, number]> = [
      [-11.5, -5.5, 0.55],
      [11.0, -7.0, -0.45],
    ];
    cottageOffsets.forEach(([ox, oz, rotY]) => {
      const cy = getTerrainHeight(wx + ox, wz + oz);
      const house = new THREE.Group();
      house.position.set(ox, cy - wy, oz);
      house.rotation.y = rotY;

      const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 4.0, 4.8), plasterMat);
      body.position.y = 2.0;
      body.castShadow = true;
      body.receiveShadow = true;
      house.add(body);

      const cRoof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.8, 4), roofMat);
      cRoof.position.y = 5.35;
      cRoof.rotation.y = Math.PI / 4;
      cRoof.castShadow = true;
      house.add(cRoof);

      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.25), woodMat);
      door.position.set(0, 1.05, 2.42);
      house.add(door);

      // Warm lit cottage windows
      const winMat = new THREE.MeshStandardMaterial({
        color: 0xffd98a,
        emissive: 0xffaa33,
        emissiveIntensity: 0.9,
      });
      this.lanternMats.push(winMat);
      for (const s of [-1.6, 1.6]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.22), winMat);
        win.position.set(s, 2.2, 2.42);
        house.add(win);
      }

      group.add(house);
      this.colliders.push({ x: wx + ox, z: wz + oz, radius: 3.3, minY: cy, maxY: cy + 6 });
    });

    scene.add(group);
  }

  private buildWhisperingRuins(scene: THREE.Scene, toonMap: THREE.DataTexture): void {
    const rx = WORLD_LANDMARKS.ruins.x;
    const rz = WORLD_LANDMARKS.ruins.z;
    const ry = getTerrainHeight(rx, rz);

    const group = new THREE.Group();
    group.position.set(rx, ry, rz);

    const ruinMat = new THREE.MeshToonMaterial({ color: 0x8d959e, gradientMap: toonMap });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x52c8ff,
      emissive: 0x38b6ff,
      emissiveIntensity: 1.9,
      roughness: 0.3,
    });

    const floorRing = new THREE.Mesh(new THREE.RingGeometry(11.5, 13.0, 36), ruinMat);
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.08;
    floorRing.receiveShadow = true;
    group.add(floorRing);

    const glyphRing = new THREE.Mesh(new THREE.RingGeometry(8.2, 8.6, 36), runeMat);
    glyphRing.rotation.x = -Math.PI / 2;
    glyphRing.position.y = 0.09;
    group.add(glyphRing);

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (Math.abs(a - 0.1) < 0.38) continue;
      const px = Math.cos(a) * 16.5;
      const pz = Math.sin(a) * 16.5;
      const height = i % 3 === 0 ? 7.8 : i % 2 === 0 ? 5.1 : 3.2;

      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.92, height, 8), ruinMat);
      pillar.position.set(px, height / 2 - 0.1, pz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      group.add(pillar);

      this.colliders.push({ x: rx + px, z: rz + pz, radius: 1.0, minY: ry, maxY: ry + height });
    }

    scene.add(group);
  }

  private buildDomainPortal(scene: THREE.Scene, toonMap: THREE.DataTexture): void {
    const dx = DOMAIN_GATE_POS.x;
    const dz = DOMAIN_GATE_POS.z;
    const dy = getTerrainHeight(dx, dz);

    const group = new THREE.Group();
    group.position.set(dx, dy, dz);
    group.rotation.y = 0.55;

    const stoneMat = new THREE.MeshToonMaterial({ color: 0xaab4c2, gradientMap: toonMap });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf4cf65,
      emissive: 0x705110,
      emissiveIntensity: 0.5,
      metalness: 0.75,
      roughness: 0.25,
    });

    // Twin towering Genshin Domain pillars & golden archway
    for (const s of [-3.2, 3.2]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8.2, 1.4), stoneMat);
      col.position.set(s, 4.1, 0);
      col.castShadow = true;
      group.add(col);

      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 1.6), goldMat);
      trim.position.set(s, 8.2, 0);
      group.add(trim);
    }

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.2, 1.6), stoneMat);
    lintel.position.set(0, 8.8, 0);
    lintel.castShadow = true;
    group.add(lintel);

    const archRing = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.22, 10, 32, Math.PI), goldMat);
    archRing.position.set(0, 4.6, 0);
    group.add(archRing);

    const portalMat = new THREE.MeshStandardMaterial({
      color: 0x62d9ff,
      emissive: 0x3b8eff,
      emissiveIntensity: 2.2,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    this.domainPortalMesh = new THREE.Mesh(new THREE.CircleGeometry(2.7, 24), portalMat);
    this.domainPortalMesh.position.set(0, 4.2, 0);
    group.add(this.domainPortalMesh);

    scene.add(group);
  }

  private buildRoadLanterns(scene: THREE.Scene, toonMap: THREE.DataTexture): void {
    const woodMat = new THREE.MeshToonMaterial({ color: 0x5c3e2a, gradientMap: toonMap });
    const positions: Array<[number, number]> = [
      [-4.2, 18], [4.2, 18], [-4.2, 4], [4.2, 4],
      [24, -34], [52, -46], [28, 8], [58, 36],
      [-26, 36], [-56, 46],
    ];

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffe49c,
      emissive: 0xffa638,
      emissiveIntensity: 0.6,
    });
    this.lanternMats.push(glassMat);

    for (const [x, z] of positions) {
      const y = getTerrainHeight(x, z);
      const lamp = new THREE.Group();
      lamp.position.set(x, y, z);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.6, 6), woodMat);
      post.position.y = 1.8;
      post.castShadow = true;
      lamp.add(post);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.08), woodMat);
      arm.position.set(0.35, 3.55, 0);
      lamp.add(arm);

      const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), glassMat);
      bulb.position.set(0.7, 3.25, 0);
      lamp.add(bulb);

      scene.add(lamp);
    }
  }

  private buildUpdraftWindCurrents(scene: THREE.Scene): void {
    const spots: Array<[number, number, number]> = [
      [14, -84, 24],
      [48, -46, 15],
      [68, 22, 16],
      [-48, 12, 15],
    ];

    const shaderMat = new THREE.ShaderMaterial({
      vertexShader: UPDRAFT_VERTEX,
      fragmentShader: UPDRAFT_FRAGMENT,
      uniforms: { uTime: this.updraftTimeUniform },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x76ffd8,
      emissive: 0x4ae3b5,
      emissiveIntensity: 1.9,
      transparent: true,
      opacity: 0.75,
    });

    spots.forEach(([x, z, height]) => {
      const baseY = getTerrainHeight(x, z);
      const radius = 4.2;

      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.85, height, 24, 1, true),
        shaderMat,
      );
      cyl.position.set(x, baseY + height / 2, z);
      scene.add(cyl);

      const baseRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.82, 0.1, 8, 28), ringMat);
      baseRing.rotation.x = Math.PI / 2;
      baseRing.position.set(x, baseY + 0.25, z);
      scene.add(baseRing);

      this.updrafts.push({ x, z, baseY: baseY - 0.5, topY: baseY + height, radius });
    });
  }
}
