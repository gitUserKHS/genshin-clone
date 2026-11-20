import * as THREE from 'three';
import { ELEMENT_COLORS, type ElementType } from '../core/Types';

interface TimedEffect {
  mesh: THREE.Object3D;
  age: number;
  maxAge: number;
  onUpdate: (dt: number, t: number) => void;
}

interface EnergyOrb {
  mesh: THREE.Mesh;
  element: ElementType;
  amount: number;
  age: number;
}

export interface ActiveSkillEntity {
  kind: 'tornado' | 'phoenix' | 'mona_phantom' | 'mona_dome' | 'ayaka_storm' | 'zhongli_stele' | 'zhongli_meteor';
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  age: number;
  maxAge: number;
  tickTimer: number;
  absorbedElement: ElementType | null;
  targetY?: number;
  impacted?: boolean;
}

function disposeHierarchy(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
}

export class VFXSystem {
  private readonly effects: TimedEffect[] = [];
  private readonly orbs: EnergyOrb[] = [];
  public readonly activeEntities: ActiveSkillEntity[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  public spawnSlashArc(pos: THREE.Vector3, facing: number, comboIdx: number, element: ElementType, radius = 2.2): void {
    const col = ELEMENT_COLORS[element].hex;
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y + 1.05, pos.z);
    group.rotation.x = Math.PI / 2 + (comboIdx % 2 === 0 ? 0.25 : -0.25);
    group.rotation.z = -facing + Math.PI / 2 + (comboIdx % 2 === 0 ? -0.4 : 0.4);

    const outerMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    group.add(new THREE.Mesh(new THREE.RingGeometry(radius * 0.52, radius, 22, 1, -Math.PI * 0.48, Math.PI * 0.96), outerMat));
    group.add(new THREE.Mesh(new THREE.RingGeometry(radius * 0.78, radius * 0.95, 22, 1, -Math.PI * 0.42, Math.PI * 0.84), innerMat));
    this.scene.add(group);

    this.effects.push({
      mesh: group,
      age: 0,
      maxAge: 0.24,
      onUpdate: (dt, t) => {
        group.rotation.z += dt * (comboIdx % 2 === 0 ? 7.2 : -7.2);
        group.scale.setScalar(1 + t * 0.35);
        outerMat.opacity = 0.92 * (1 - t);
        innerMat.opacity = 0.85 * (1 - t);
      },
    });
  }

  public spawnShockwave(pos: THREE.Vector3, element: ElementType, maxRadius: number, duration = 0.48): void {
    const col = ELEMENT_COLORS[element].hex;
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 1.0, 36), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.14, pos.z);
    this.scene.add(ring);

    const sphereMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), sphereMat);
    dome.position.set(pos.x, pos.y + 0.3, pos.z);
    this.scene.add(dome);

    this.effects.push({
      mesh: ring,
      age: 0,
      maxAge: duration,
      onUpdate: (_dt, t) => {
        ring.scale.setScalar(0.5 + t * maxRadius);
        mat.opacity = 0.9 * (1 - t);
      },
    });
    this.effects.push({
      mesh: dome,
      age: 0,
      maxAge: duration * 0.82,
      onUpdate: (_dt, t) => {
        dome.scale.setScalar(0.5 + t * maxRadius * 0.72);
        sphereMat.opacity = 0.32 * (1 - t);
      },
    });
  }

  public spawnWaterRipple(x: number, y: number, z: number, scale = 1.0): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd8faff,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.42, 24), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
    this.scene.add(ring);

    this.effects.push({
      mesh: ring,
      age: 0,
      maxAge: 0.65,
      onUpdate: (_dt, t) => {
        ring.scale.setScalar((0.8 + t * 2.6) * scale);
        mat.opacity = 0.72 * (1 - t);
      },
    });
  }

  public spawnElementalSightPulse(pos: THREE.Vector3): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x80ecff,
      transparent: true,
      opacity: 0.35,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), mat);
    sphere.position.copy(pos);
    this.scene.add(sphere);

    this.effects.push({
      mesh: sphere,
      age: 0,
      maxAge: 1.1,
      onUpdate: (_dt, t) => {
        sphere.scale.setScalar(1 + t * 55);
        mat.opacity = 0.35 * (1 - t);
      },
    });
  }

  public spawnHitBurst(pos: THREE.Vector3, element: ElementType, count = 10): void {
    const col = ELEMENT_COLORS[element].hex;
    const group = new THREE.Group();
    group.position.copy(pos);
    const velocities: THREE.Vector3[] = [];
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const geo = new THREE.OctahedronGeometry(0.11, 0);

    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = Math.random() * Math.PI * 2;
      const spd = 2.6 + Math.random() * 5.4;
      velocities.push(new THREE.Vector3(Math.cos(a) * spd, 1.5 + Math.random() * 4.4, Math.sin(a) * spd));
      group.add(m);
    }
    this.scene.add(group);

    this.effects.push({
      mesh: group,
      age: 0,
      maxAge: 0.44,
      onUpdate: (dt, t) => {
        group.children.forEach((c, idx) => {
          const v = velocities[idx];
          c.position.addScaledVector(v, dt);
          v.y -= 9.8 * dt;
          c.scale.setScalar(1 - t * 0.72);
        });
        mat.opacity = 1 - t;
      },
    });
  }

  public spawnLightningArc(from: THREE.Vector3, to: THREE.Vector3, colorHex = 0xd285ff, duration = 0.28): void {
    const pts: THREE.Vector3[] = [];
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = new THREE.Vector3().lerpVectors(from, to, t);
      if (i > 0 && i < steps) {
        p.x += (Math.random() - 0.5) * 0.85;
        p.y += (Math.random() - 0.5) * 0.85;
        p.z += (Math.random() - 0.5) * 0.85;
      }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.effects.push({
      mesh: line,
      age: 0,
      maxAge: duration,
      onUpdate: (_dt, t) => {
        mat.opacity = 1 - t;
      },
    });
  }

  public spawnProjectile(
    start: THREE.Vector3,
    dir: THREE.Vector3,
    speed: number,
    element: ElementType,
    maxDist = 14,
  ): void {
    const col = ELEMENT_COLORS[element].hex;
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 2.6,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), mat);
    orb.position.copy(start);
    this.scene.add(orb);

    const dur = maxDist / speed;
    this.effects.push({
      mesh: orb,
      age: 0,
      maxAge: dur,
      onUpdate: (dt, t) => {
        orb.position.addScaledVector(dir, speed * dt);
        orb.scale.setScalar(1 - t * 0.4);
      },
    });
  }

  public spawnHealingBeam(pos: THREE.Vector3, colorHex = 0x62ffcf): void {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 24, 20, 1, true), mat);
    beam.position.set(pos.x, pos.y + 12, pos.z);
    this.scene.add(beam);

    this.effects.push({
      mesh: beam,
      age: 0,
      maxAge: 1.4,
      onUpdate: (dt, t) => {
        beam.rotation.y += dt * 2.5;
        mat.opacity = 0.72 * (1 - t);
      },
    });
  }

  public spawnTravelerTornado(start: THREE.Vector3, dir: THREE.Vector3): ActiveSkillEntity {
    const group = new THREE.Group();
    group.position.copy(start);

    const matOuter = new THREE.MeshBasicMaterial({
      color: 0x56f0c8,
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 0.9, 7.6, 20, 1, true), matOuter);
    funnel.position.y = 3.8;
    group.add(funnel);

    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 0.5, 7.2, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xb8fff0,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    inner.position.y = 3.6;
    group.add(inner);

    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2 + i * 0.52, 0.085, 6, 22), matOuter);
      ring.rotation.x = Math.PI / 2 + (i % 2 === 0 ? 0.16 : -0.16);
      ring.position.y = 0.9 + i * 1.4;
      group.add(ring);
    }

    this.scene.add(group);
    const entity: ActiveSkillEntity = {
      kind: 'tornado',
      mesh: group,
      pos: start.clone(),
      vel: dir.clone().multiplyScalar(5.4),
      radius: 4.9,
      age: 0,
      maxAge: 5.5,
      tickTimer: 0,
      absorbedElement: null,
    };
    this.activeEntities.push(entity);
    return entity;
  }

  public spawnDilucPhoenix(start: THREE.Vector3, dir: THREE.Vector3): ActiveSkillEntity {
    const group = new THREE.Group();
    group.position.set(start.x, start.y + 1.5, start.z);
    group.rotation.y = Math.atan2(dir.x, dir.z);

    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff6b24,
      emissive: 0xff3b10,
      emissiveIntensity: 2.7,
      transparent: true,
      opacity: 0.94,
    });
    const goldFlameMat = new THREE.MeshBasicMaterial({
      color: 0xffe478,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
    });

    // Sculpted Phoenix torso, crest & streaming tail feathers
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.62, 3.2, 10), flameMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), goldFlameMat);
    head.position.z = 1.65;
    group.add(head);

    // Layered multi-feather arched wings
    const leftWing = new THREE.Group();
    const rightWing = new THREE.Group();
    for (let f = 0; f < 4; f++) {
      const featherL = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 0.72 - f * 0.1), f === 0 ? goldFlameMat : flameMat);
      featherL.position.set(0.9 + f * 0.65, 0.18 + f * 0.12, 0.3 - f * 0.32);
      featherL.rotation.y = -0.22 - f * 0.08;
      leftWing.add(featherL);

      const featherR = featherL.clone();
      featherR.position.x = -featherL.position.x;
      featherR.rotation.y = -featherL.rotation.y;
      rightWing.add(featherR);
    }
    group.add(leftWing, rightWing);

    // Flaming tail streamers
    for (const s of [-0.45, 0, 0.45]) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.26, 2.8, 6), flameMat);
      tail.rotation.x = -Math.PI / 2;
      tail.position.set(s, 0, -2.2);
      group.add(tail);
    }

    this.scene.add(group);
    const entity: ActiveSkillEntity = {
      kind: 'phoenix',
      mesh: group,
      pos: group.position.clone(),
      vel: dir.clone().multiplyScalar(14.5),
      radius: 4.5,
      age: 0,
      maxAge: 1.75,
      tickTimer: 0,
      absorbedElement: null,
    };
    this.activeEntities.push(entity);
    return entity;
  }

  public spawnMonaPhantom(pos: THREE.Vector3): ActiveSkillEntity {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y + 1.2, pos.z);

    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x45c8ff,
      emissive: 0x2492ff,
      emissiveIntensity: 2.5,
      transparent: true,
      opacity: 0.88,
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 16), orbMat));
    group.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(1.25, 0.06, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0x99ecff, blending: THREE.AdditiveBlending }),
      ),
    );

    this.scene.add(group);
    const entity: ActiveSkillEntity = {
      kind: 'mona_phantom',
      mesh: group,
      pos: pos.clone(),
      vel: new THREE.Vector3(),
      radius: 4.6,
      age: 0,
      maxAge: 5.0,
      tickTimer: 0,
      absorbedElement: null,
    };
    this.activeEntities.push(entity);
    return entity;
  }

  public spawnMonaCosmicDome(pos: THREE.Vector3): ActiveSkillEntity {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y + 0.15, pos.z);

    const domeMat = new THREE.MeshBasicMaterial({
      color: 0x3b66ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(7.0, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), domeMat));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(6.3, 7.0, 40),
      new THREE.MeshBasicMaterial({ color: 0x85e3ff, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const zodiac = new THREE.Mesh(
      new THREE.TorusGeometry(4.6, 0.08, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffdf78, blending: THREE.AdditiveBlending }),
    );
    zodiac.rotation.x = Math.PI / 2;
    zodiac.position.y = 2.4;
    group.add(zodiac);

    this.scene.add(group);
    const entity: ActiveSkillEntity = {
      kind: 'mona_dome',
      mesh: group,
      pos: pos.clone(),
      vel: new THREE.Vector3(),
      radius: 7.2,
      age: 0,
      maxAge: 6.5,
      tickTimer: 0,
      absorbedElement: null,
    };
    this.activeEntities.push(entity);
    return entity;
  }

  public spawnKeqingSlashes(center: THREE.Vector3): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.35;
      const r = 5.2;
      const p1 = new THREE.Vector3(center.x + Math.cos(a) * r, center.y + 0.5 + Math.random() * 2.4, center.z + Math.sin(a) * r);
      const p2 = new THREE.Vector3(center.x - Math.cos(a) * r, center.y + 0.5 + Math.random() * 2.4, center.z - Math.sin(a) * r);
      this.spawnLightningArc(p1, p2, 0xd485ff, 0.52);
    }
    this.spawnShockwave(center, 'electro', 6.8, 0.65);
  }

  public spawnAyakaFrostLotus(pos: THREE.Vector3): void {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y + 0.25, pos.z);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xa8f5ff,
      emissive: 0x5eeaff,
      emissiveIntensity: 2.3,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 4), mat);
      petal.position.set(Math.cos(a) * 1.4, 0.7, Math.sin(a) * 1.4);
      petal.rotation.z = -Math.cos(a) * 0.95;
      petal.rotation.x = Math.sin(a) * 0.95;
      group.add(petal);
    }
    this.scene.add(group);
    this.spawnShockwave(pos, 'cryo', 5.2, 0.5);

    this.effects.push({
      mesh: group,
      age: 0,
      maxAge: 0.85,
      onUpdate: (dt, t) => {
        group.rotation.y += dt * 3.5;
        group.scale.setScalar(0.5 + t * 1.4);
        mat.opacity = 0.9 * (1 - t);
      },
    });
  }

  public spawnAyakaFrostStorm(start: THREE.Vector3, dir: THREE.Vector3): ActiveSkillEntity {
    const group = new THREE.Group();
    group.position.set(start.x, start.y + 1.8, start.z);

    const iceMat = new THREE.MeshStandardMaterial({
      color: 0xb8f8ff,
      emissive: 0x5eeeff,
      emissiveIntensity: 2.5,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    });

    // Giant spinning crystalline Frost Soumetsu blade fan
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.8, 4), iceMat);
      blade.position.set(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6);
      blade.rotation.z = Math.PI / 2;
      blade.rotation.y = a;
      group.add(blade);
    }
    group.add(new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.12, 8, 28), iceMat));

    this.scene.add(group);
    const entity: ActiveSkillEntity = {
      kind: 'ayaka_storm',
      mesh: group,
      pos: start.clone(),
      vel: dir.clone().multiplyScalar(7.2),
      radius: 4.5,
      age: 0,
      maxAge: 4.2,
      tickTimer: 0,
      absorbedElement: null,
    };
    this.activeEntities.push(entity);
    return entity;
  }

  public spawnZhongliStele(pos: THREE.Vector3): ActiveSkillEntity {
    // Limit to 1 active stele
    for (let i = this.activeEntities.length - 1; i >= 0; i--) {
      if (this.activeEntities[i].kind === 'zhongli_stele') {
        this.scene.remove(this.activeEntities[i].mesh);
        disposeHierarchy(this.activeEntities[i].mesh);
        this.activeEntities.splice(i, 1);
      }
    }

    const group = new THREE.Group();
    group.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.65, metalness: 0.25 });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0xffd25a,
      emissive: 0xffa824,
      emissiveIntensity: 2.4,
    });

    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 5.2, 0.95), stoneMat);
    pillar.position.y = 2.6;
    pillar.castShadow = true;
    group.add(pillar);

    for (let r = 0; r < 4; r++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.16, 1.04), runeMat);
      band.position.y = 1.0 + r * 1.1;
      group.add(band);
    }
    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), runeMat);
    crown.position.y = 5.6;
    group.add(crown);

    this.scene.add(group);
    const entity: ActiveSkillEntity = {
      kind: 'zhongli_stele',
      mesh: group,
      pos: pos.clone(),
      vel: new THREE.Vector3(),
      radius: 6.2,
      age: 0,
      maxAge: 14.0,
      tickTimer: 0,
      absorbedElement: null,
    };
    this.activeEntities.push(entity);
    return entity;
  }

  public spawnZhongliMeteor(targetPos: THREE.Vector3): ActiveSkillEntity {
    const startPos = new THREE.Vector3(targetPos.x - 5, targetPos.y + 24, targetPos.z - 5);
    const group = new THREE.Group();
    group.position.copy(startPos);

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x5c3c1e,
      emissive: 0xd97b18,
      emissiveIntensity: 1.4,
      roughness: 0.5,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffe478,
      emissive: 0xffb324,
      emissiveIntensity: 2.8,
      wireframe: true,
    });

    const meteor = new THREE.Mesh(new THREE.DodecahedronGeometry(3.1, 1), rockMat);
    group.add(meteor);
    const lattice = new THREE.Mesh(new THREE.IcosahedronGeometry(3.35, 1), coreMat);
    group.add(lattice);

    this.scene.add(group);
    const dir = targetPos.clone().sub(startPos).normalize();
    const entity: ActiveSkillEntity = {
      kind: 'zhongli_meteor',
      mesh: group,
      pos: startPos,
      vel: dir.multiplyScalar(38),
      radius: 9.2,
      age: 0,
      maxAge: 1.35,
      tickTimer: 0,
      absorbedElement: null,
      targetY: targetPos.y + 0.5,
      impacted: false,
    };
    this.activeEntities.push(entity);
    return entity;
  }

  public spawnEnergyOrbs(pos: THREE.Vector3, element: ElementType, count: number, amountPerOrb: number): void {
    const col = ELEMENT_COLORS[element].hex;
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.5 });
    const geo = new THREE.SphereGeometry(0.18, 8, 8);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(
        pos.x + (Math.random() - 0.5) * 1.4,
        pos.y + 1.1 + Math.random() * 0.8,
        pos.z + (Math.random() - 0.5) * 1.4,
      );
      this.scene.add(m);
      this.orbs.push({ mesh: m, element, amount: amountPerOrb, age: 0 });
    }
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    onCollectOrb: (element: ElementType, amount: number) => void,
    onSkillEntityTick: (entity: ActiveSkillEntity) => void,
    onSkillEntityEnd: (entity: ActiveSkillEntity) => void,
  ): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.age += dt;
      const t = Math.min(1, fx.age / fx.maxAge);
      fx.onUpdate(dt, t);
      if (fx.age >= fx.maxAge) {
        this.scene.remove(fx.mesh);
        disposeHierarchy(fx.mesh);
        this.effects.splice(i, 1);
      }
    }

    for (let i = this.activeEntities.length - 1; i >= 0; i--) {
      const e = this.activeEntities[i];
      e.age += dt;
      e.pos.addScaledVector(e.vel, dt);
      e.mesh.position.x = e.pos.x;
      e.mesh.position.z = e.pos.z;

      if (e.kind === 'tornado') {
        e.mesh.rotation.y += dt * 8.2;
        if (e.absorbedElement) {
          const tint = ELEMENT_COLORS[e.absorbedElement].hex;
          const firstMesh = e.mesh.children[0] as THREE.Mesh | undefined;
          if (firstMesh && firstMesh.material instanceof THREE.MeshBasicMaterial) {
            firstMesh.material.color.setHex(tint);
          }
        }
        e.tickTimer += dt;
        if (e.tickTimer >= 0.46) {
          e.tickTimer = 0;
          onSkillEntityTick(e);
        }
      } else if (e.kind === 'phoenix') {
        e.mesh.position.y = e.pos.y;
        const wingFlap = Math.sin(e.age * 16) * 0.28;
        if (e.mesh.children[2]) e.mesh.children[2].rotation.z = wingFlap;
        if (e.mesh.children[3]) e.mesh.children[3].rotation.z = -wingFlap;
        e.tickTimer += dt;
        if (e.tickTimer >= 0.16) {
          e.tickTimer = 0;
          this.spawnHitBurst(e.pos, 'pyro', 4);
          onSkillEntityTick(e);
        }
      } else if (e.kind === 'mona_phantom') {
        e.mesh.rotation.y += dt * 2.5;
        e.mesh.position.y = e.pos.y + 1.2 + Math.sin(e.age * 4) * 0.16;
        e.tickTimer += dt;
        if (e.tickTimer >= 1.0) {
          e.tickTimer = 0;
          this.spawnShockwave(e.pos, 'hydro', 4.6, 0.35);
          onSkillEntityTick(e);
        }
      } else if (e.kind === 'mona_dome') {
        e.mesh.rotation.y += dt * 0.45;
      } else if (e.kind === 'ayaka_storm') {
        e.mesh.rotation.y += dt * 11;
        e.mesh.rotation.z += dt * 4;
        e.tickTimer += dt;
        if (e.tickTimer >= 0.28) {
          e.tickTimer = 0;
          this.spawnHitBurst(e.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 'cryo', 5);
          onSkillEntityTick(e);
        }
      } else if (e.kind === 'zhongli_stele') {
        e.tickTimer += dt;
        if (e.tickTimer >= 1.8) {
          e.tickTimer = 0;
          this.spawnShockwave(e.pos, 'geo', 6.2, 0.45);
          onSkillEntityTick(e);
        }
      } else if (e.kind === 'zhongli_meteor') {
        e.mesh.position.y = e.pos.y;
        e.mesh.rotation.x += dt * 3;
        e.mesh.rotation.y += dt * 4;
        if (!e.impacted && e.targetY !== undefined && e.pos.y <= e.targetY) {
          e.impacted = true;
          e.vel.set(0, 0, 0);
          this.spawnShockwave(e.pos, 'geo', 9.5, 0.72);
          this.spawnHitBurst(e.pos, 'geo', 24);
          onSkillEntityTick(e);
          e.age = e.maxAge; // Expire immediately on explosion
        }
      }

      if (e.age >= e.maxAge) {
        onSkillEntityEnd(e);
        this.scene.remove(e.mesh);
        disposeHierarchy(e.mesh);
        this.activeEntities.splice(i, 1);
      }
    }

    const target = new THREE.Vector3(playerPos.x, playerPos.y + 1.1, playerPos.z);
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.age += dt;
      if (orb.age > 0.24) {
        const dir = target.clone().sub(orb.mesh.position);
        const dist = dir.length();
        if (dist < 0.75 || orb.age > 4.0) {
          onCollectOrb(orb.element, orb.amount);
          this.scene.remove(orb.mesh);
          orb.mesh.geometry.dispose();
          (orb.mesh.material as THREE.Material).dispose();
          this.orbs.splice(i, 1);
          continue;
        }
        dir.normalize();
        orb.mesh.position.addScaledVector(dir, Math.min(dist, (8 + orb.age * 15) * dt));
      }
    }
  }
}
