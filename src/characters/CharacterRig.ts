import * as THREE from 'three';
import { ELEMENT_COLORS, type AlternateSprintType, type CharacterDef, type ElementType, type WeaponDef } from '../core/Types';
import { createToonGradientMap } from '../world/FoliageSystem';
import { WEAPONS } from './CharacterData';

export type AnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'jump'
  | 'fall'
  | 'glide'
  | 'climb'
  | 'swim'
  | 'attack'
  | 'charged'
  | 'plunge'
  | 'skill'
  | 'burst';

export class CharacterRig {
  public readonly root = new THREE.Group();
  public readonly def: CharacterDef;

  private readonly characterBody = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly weaponHand = new THREE.Group();
  private readonly weaponBack = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly gliderGroup = new THREE.Group();
  private readonly leftWing = new THREE.Group();
  private readonly rightWing = new THREE.Group();
  private readonly capePivot = new THREE.Group();
  private readonly hairTailPivot = new THREE.Group();

  private readonly shieldMesh: THREE.Mesh;
  private readonly shieldMat: THREE.MeshStandardMaterial;
  private readonly altSprintGroup = new THREE.Group();
  private readonly altSprintMat: THREE.MeshStandardMaterial;

  private weaponInHandMesh: THREE.Group | null = null;
  private weaponOnBackMesh: THREE.Group | null = null;
  private catalystOrbGroup: THREE.Group | null = null;

  private animTime = 0;
  private attackSwingPhase = 0;
  private attackSwingTimer = 0;
  private attackComboIdx = 0;
  private weaponUnsheathedTimer = 0;

  constructor(def: CharacterDef, weaponId: string) {
    this.def = def;
    const toonMap = createToonGradientMap();
    const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1422, side: THREE.BackSide });

    const skinMat = new THREE.MeshToonMaterial({ color: def.colors.skin, gradientMap: toonMap });
    const hairMat = new THREE.MeshToonMaterial({ color: def.colors.hair, gradientMap: toonMap });
    const hairShadowMat = new THREE.MeshToonMaterial({ color: def.colors.hairShadow, gradientMap: toonMap });
    const primaryMat = new THREE.MeshToonMaterial({ color: def.colors.outfitPrimary, gradientMap: toonMap });
    const secondaryMat = new THREE.MeshToonMaterial({ color: def.colors.outfitSecondary, gradientMap: toonMap });
    const accentMat = new THREE.MeshStandardMaterial({
      color: def.colors.accent,
      emissive: def.colors.accent,
      emissiveIntensity: 0.25,
      metalness: 0.65,
      roughness: 0.3,
    });
    const capeMat = new THREE.MeshToonMaterial({
      color: def.colors.cape,
      gradientMap: toonMap,
      side: THREE.DoubleSide,
    });
    const visionMat = new THREE.MeshStandardMaterial({
      color: ELEMENT_COLORS[def.element].hex,
      emissive: ELEMENT_COLORS[def.element].hex,
      emissiveIntensity: 2.3,
    });

    this.root.add(this.characterBody);
    this.hips.position.y = 0.92;
    this.characterBody.add(this.hips);

    // Sculpted anime torso (Lathe profile for clean waist & shoulders)
    this.hips.add(this.torso);
    const torsoPts = [
      new THREE.Vector2(0.11, 0.0),
      new THREE.Vector2(0.125, 0.14),
      new THREE.Vector2(0.165, 0.32),
      new THREE.Vector2(0.175, 0.46),
      new THREE.Vector2(0.085, 0.52),
    ];
    const chestGeo = new THREE.LatheGeometry(torsoPts, 12);
    const chest = new THREE.Mesh(chestGeo, primaryMat);
    chest.castShadow = true;
    this.torso.add(chest);

    const chestOutline = new THREE.Mesh(chestGeo, outlineMat);
    chestOutline.scale.set(1.06, 1.01, 1.06);
    this.torso.add(chestOutline);

    // Layered pleated tunic / coat skirt with golden hem
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.27, 0.38, 12, 1, true), secondaryMat);
    skirt.position.y = -0.04;
    skirt.castShadow = true;
    this.torso.add(skirt);

    const skirtHem = new THREE.Mesh(new THREE.TorusGeometry(0.268, 0.016, 6, 20), accentMat);
    skirtHem.rotation.x = Math.PI / 2;
    skirtHem.position.y = -0.23;
    this.torso.add(skirtHem);

    // Shoulder mantle / collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 18), accentMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.48;
    this.torso.add(collar);

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.024, 6, 16), accentMat);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.12;
    this.torso.add(belt);

    // Ornate glowing Elemental Vision framed in gold on lower back
    const visionFrame = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.014, 6, 16), accentMat);
    visionFrame.position.set(0, 0.2, -0.175);
    this.torso.add(visionFrame);

    const visionOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.064, 0), visionMat);
    visionOrb.position.set(0, 0.2, -0.18);
    this.torso.add(visionOrb);

    // Layered Tapered Anime Cape / Twin Coat Tails (not a flat rectangle!)
    this.capePivot.position.set(0, 0.47, -0.145);
    const capeShape = new THREE.Shape();
    capeShape.moveTo(-0.17, 0);
    capeShape.lineTo(0.17, 0);
    capeShape.lineTo(0.24, -0.68);
    capeShape.lineTo(0.04, -0.58);
    capeShape.lineTo(0, -0.78);
    capeShape.lineTo(-0.04, -0.58);
    capeShape.lineTo(-0.24, -0.68);
    capeShape.closePath();
    const capeMesh = new THREE.Mesh(new THREE.ShapeGeometry(capeShape), capeMat);
    capeMesh.position.z = -0.025;
    capeMesh.rotation.x = 0.14;
    capeMesh.castShadow = true;
    this.capePivot.add(capeMesh);
    this.torso.add(this.capePivot);

    // Back sheathed weapon mount
    this.weaponBack.position.set(0.06, 0.32, -0.22);
    this.weaponBack.rotation.z = -0.65;
    this.torso.add(this.weaponBack);

    // Head & Expressive Anime Face
    this.headGroup.position.y = 0.67;
    this.torso.add(this.headGroup);

    const headGeo = new THREE.SphereGeometry(0.21, 20, 18);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    const headOutline = new THREE.Mesh(new THREE.SphereGeometry(0.221, 18, 16), outlineMat);
    this.headGroup.add(headOutline);

    const faceTex = this.createAnimeFaceTexture(def);
    const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true });
    const facePatch = new THREE.Mesh(
      new THREE.SphereGeometry(0.214, 16, 16, Math.PI * 0.22, Math.PI * 0.56, Math.PI * 0.24, Math.PI * 0.52),
      faceMat,
    );
    this.headGroup.add(facePatch);

    // Sculpted layered hair crown & bangs
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.226, 18, 16, 0, Math.PI * 2, 0, Math.PI * 0.64),
      hairMat,
    );
    hairCap.rotation.x = -0.2;
    hairCap.castShadow = true;
    this.headGroup.add(hairCap);

    // Volume side framing locks
    for (const s of [-1, 1]) {
      const sideLock = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.34, 6), hairMat);
      sideLock.position.set(s * 0.19, -0.06, 0.09);
      sideLock.rotation.x = Math.PI;
      sideLock.rotation.z = s * 0.12;
      this.headGroup.add(sideLock);
    }

    for (let i = -2; i <= 2; i++) {
      const bang = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.22, 5), hairMat);
      bang.position.set(i * 0.066, 0.07, 0.2);
      bang.rotation.x = Math.PI - 0.18;
      bang.rotation.z = i * 0.14;
      this.headGroup.add(bang);
    }

    // Character-specific flowing back hair
    this.hairTailPivot.position.set(0, 0.04, -0.2);
    this.headGroup.add(this.hairTailPivot);

    if (def.hairStyle === 'braid') {
      const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.022, 0.62, 7), hairMat);
      braid.position.set(0, -0.28, -0.04);
      braid.rotation.x = 0.22;
      this.hairTailPivot.add(braid);
    } else if (def.hairStyle === 'ponytail') {
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 12), accentMat);
      tie.position.set(0, 0.02, -0.02);
      this.hairTailPivot.add(tie);
      const pony = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.66, 8), hairMat);
      pony.position.set(0, -0.28, -0.08);
      pony.rotation.x = Math.PI - 0.28;
      this.hairTailPivot.add(pony);
    } else if (def.hairStyle === 'twintails') {
      for (const s of [-1, 1]) {
        const twin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.68, 8), hairMat);
        twin.position.set(s * 0.22, -0.28, -0.04);
        twin.rotation.x = Math.PI - 0.16;
        twin.rotation.z = s * -0.18;
        this.hairTailPivot.add(twin);
      }
    } else if (def.hairStyle === 'catbuns') {
      for (const s of [-1, 1]) {
        const bun = new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.17, 6), hairMat);
        bun.position.set(s * 0.14, 0.22, 0.02);
        bun.rotation.z = s * -0.35;
        this.headGroup.add(bun);
        const strand = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.58, 7), hairMat);
        strand.position.set(s * 0.14, -0.28, -0.06);
        strand.rotation.x = Math.PI - 0.16;
        this.hairTailPivot.add(strand);
      }
    } else if (def.hairStyle === 'himecut') {
      // Ayaka high ponytail with crimson crest ribbon & long silver-blue hime locks
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.05), accentMat);
      ribbon.position.set(0, 0.08, -0.03);
      this.hairTailPivot.add(ribbon);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.72, 8), hairMat);
      tail.position.set(0, -0.28, -0.09);
      tail.rotation.x = Math.PI - 0.26;
      this.hairTailPivot.add(tail);
    } else if (def.hairStyle === 'longtail') {
      // Zhongli sleek dark-to-amber rat-tail
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.038, 0.34, 7), hairMat);
      upper.position.set(0, -0.16, -0.04);
      upper.rotation.x = 0.16;
      this.hairTailPivot.add(upper);
      const amberTip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.36, 7), hairShadowMat);
      amberTip.position.set(0, -0.46, -0.08);
      amberTip.rotation.x = Math.PI - 0.16;
      this.hairTailPivot.add(amberTip);
    }

    if (def.hasHat) {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.49, 0.032, 22), primaryMat);
      brim.position.set(0, 0.18, -0.02);
      brim.rotation.x = -0.12;
      this.headGroup.add(brim);

      const brimTrim = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.016, 6, 24), accentMat);
      brimTrim.rotation.x = Math.PI / 2 - 0.12;
      brimTrim.position.set(0, 0.18, -0.02);
      this.headGroup.add(brimTrim);

      const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.44, 16), primaryMat);
      hatCone.position.set(0, 0.38, -0.06);
      hatCone.rotation.x = -0.22;
      this.headGroup.add(hatCone);
    }

    // Arms with contoured pauldrons & sleeves
    this.leftArm.position.set(0.22, 0.45, 0);
    this.rightArm.position.set(-0.22, 0.45, 0);
    this.torso.add(this.leftArm, this.rightArm);

    for (const armGroup of [this.leftArm, this.rightArm]) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.072, 8, 8), accentMat);
      armGroup.add(pauldron);
      const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.042, 0.46, 8), secondaryMat);
      armMesh.position.y = -0.22;
      armMesh.castShadow = true;
      armGroup.add(armMesh);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), skinMat);
      hand.position.y = -0.46;
      armGroup.add(hand);
    }

    this.weaponHand.position.set(0, -0.46, 0.05);
    this.rightArm.add(this.weaponHand);

    // Legs & Stylized Knee-High Boots
    this.leftLeg.position.set(0.092, 0, 0);
    this.rightLeg.position.set(-0.092, 0, 0);
    this.hips.add(this.leftLeg, this.rightLeg);

    for (const legGroup of [this.leftLeg, this.rightLeg]) {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.052, 0.46, 8), primaryMat);
      thigh.position.y = -0.24;
      thigh.castShadow = true;
      legGroup.add(thigh);

      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.014, 6, 12), accentMat);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.47;
      legGroup.add(cuff);

      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.064, 0.45, 8), secondaryMat);
      boot.position.y = -0.69;
      boot.castShadow = true;
      legGroup.add(boot);
    }

    // Feathered Wind Glider Wings
    this.gliderGroup.position.set(0, 0.46, -0.18);
    this.gliderGroup.visible = false;
    this.torso.add(this.gliderGroup);

    const wingBlueMat = new THREE.MeshToonMaterial({
      color: 0x3b78d8,
      gradientMap: toonMap,
      side: THREE.DoubleSide,
    });
    const wingGoldMat = new THREE.MeshStandardMaterial({
      color: 0xf4cf65,
      emissive: 0x705012,
      emissiveIntensity: 0.45,
    });

    for (const [wingPivot, side] of [
      [this.leftWing, 1],
      [this.rightWing, -1],
    ] as const) {
      wingPivot.position.set(side * 0.14, 0.06, -0.04);
      for (let f = 0; f < 4; f++) {
        const feather = new THREE.Mesh(new THREE.BoxGeometry(1.25 - f * 0.18, 0.32, 0.035), wingBlueMat);
        feather.position.set(side * (0.68 - f * 0.08), 0.12 - f * 0.15, -f * 0.025);
        feather.rotation.z = side * (0.12 - f * 0.18);
        wingPivot.add(feather);
      }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.08, 0.05), wingGoldMat);
      frame.position.set(side * 0.68, 0.28, 0.02);
      frame.rotation.z = side * 0.14;
      wingPivot.add(frame);
      this.gliderGroup.add(wingPivot);
    }

    // Glowing Translucent Shield Sphere (Zhongli Jade Shield / Crystallize)
    this.shieldMat = new THREE.MeshStandardMaterial({
      color: 0xf5c851,
      emissive: 0xf0ae2b,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.24,
      wireframe: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.12, 1), this.shieldMat);
    this.shieldMesh.position.y = 1.0;
    this.shieldMesh.visible = false;
    const shieldWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.14, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe485, wireframe: true, transparent: true, opacity: 0.32 }),
    );
    this.shieldMesh.add(shieldWire);
    this.root.add(this.shieldMesh);

    // Alternate Sprint Puddle (Mona Water Torrent / Ayaka Frost Dash)
    this.altSprintMat = new THREE.MeshStandardMaterial({
      color: def.altSprint === 'cryo' ? 0x9cf5ff : 0x3ab8ff,
      emissive: def.altSprint === 'cryo' ? 0x5eeaff : 0x2688ff,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    });
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), this.altSprintMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = 0.09;
    this.altSprintGroup.add(puddle);
    const vortexRing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 8, 24), this.altSprintMat);
    vortexRing.rotation.x = Math.PI / 2;
    vortexRing.position.y = 0.22;
    this.altSprintGroup.add(vortexRing);
    this.altSprintGroup.visible = false;
    this.root.add(this.altSprintGroup);

    this.equipWeapon(WEAPONS[weaponId] || Object.values(WEAPONS)[0]);
  }

  public setShieldVisual(element: ElementType | null): void {
    if (!element) {
      this.shieldMesh.visible = false;
      return;
    }
    this.shieldMesh.visible = true;
    const col = ELEMENT_COLORS[element].hex;
    this.shieldMat.color.setHex(col);
    this.shieldMat.emissive.setHex(col);
  }

  public setAltSprintVisual(mode: AlternateSprintType): void {
    const active = mode !== 'none';
    this.altSprintGroup.visible = active;
    this.characterBody.visible = !active;
  }

  public equipWeapon(weapon: WeaponDef): void {
    if (this.weaponInHandMesh) {
      this.weaponHand.remove(this.weaponInHandMesh);
      this.weaponInHandMesh = null;
    }
    if (this.weaponOnBackMesh) {
      this.weaponBack.remove(this.weaponOnBackMesh);
      this.weaponOnBackMesh = null;
    }
    if (this.catalystOrbGroup) {
      this.torso.remove(this.catalystOrbGroup);
      this.catalystOrbGroup = null;
    }

    if (weapon.type === 'catalyst') {
      const orbGroup = this.buildWeaponModel(weapon);
      orbGroup.position.set(-0.38, 0.36, -0.22);
      this.torso.add(orbGroup);
      this.catalystOrbGroup = orbGroup;
      return;
    }

    this.weaponInHandMesh = this.buildWeaponModel(weapon);
    this.weaponInHandMesh.rotation.x = Math.PI / 2;
    this.weaponInHandMesh.visible = false;
    this.weaponHand.add(this.weaponInHandMesh);

    this.weaponOnBackMesh = this.buildWeaponModel(weapon);
    this.weaponOnBackMesh.scale.setScalar(0.92);
    this.weaponOnBackMesh.visible = true;
    this.weaponBack.add(this.weaponOnBackMesh);
  }

  private buildWeaponModel(weapon: WeaponDef): THREE.Group {
    const bladeMat = new THREE.MeshStandardMaterial({
      color: weapon.color,
      metalness: 0.78,
      roughness: 0.22,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: weapon.accentColor,
      emissive: weapon.accentColor,
      emissiveIntensity: weapon.rarity >= 4 ? 1.3 : 0.45,
      metalness: 0.68,
      roughness: 0.25,
    });

    const wGroup = new THREE.Group();
    if (weapon.type === 'catalyst') {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.06), bladeMat);
      wGroup.add(book);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 8, 24), accentMat);
      wGroup.add(ring);
    } else if (weapon.type === 'polearm') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 1.85, 8), bladeMat);
      shaft.position.y = 0.42;
      shaft.castShadow = true;
      wGroup.add(shaft);
      const guard = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12), accentMat);
      guard.rotation.x = Math.PI / 2;
      guard.position.y = 1.28;
      wGroup.add(guard);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.44, 4), accentMat);
      tip.position.y = 1.54;
      tip.castShadow = true;
      wGroup.add(tip);
    } else if (weapon.type === 'sword') {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.22, 6), accentMat);
      wGroup.add(grip);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.06), accentMat);
      guard.position.y = 0.12;
      wGroup.add(guard);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.9, 0.024), bladeMat);
      blade.position.y = 0.59;
      blade.castShadow = true;
      wGroup.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.16, 4), accentMat);
      tip.position.y = 1.12;
      wGroup.add(tip);
    } else {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.34, 6), accentMat);
      wGroup.add(grip);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.075, 0.08), accentMat);
      guard.position.y = 0.18;
      wGroup.add(guard);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.165, 1.28, 0.038), bladeMat);
      blade.position.y = 0.85;
      blade.castShadow = true;
      wGroup.add(blade);
    }
    return wGroup;
  }

  public triggerAttackSwing(comboIdx: number): void {
    this.attackComboIdx = comboIdx;
    this.attackSwingTimer = 0.36;
    this.attackSwingPhase = 0;
    this.weaponUnsheathedTimer = 2.6;
  }

  public triggerUnsheathe(): void {
    this.weaponUnsheathedTimer = 2.6;
  }

  public updateAnimation(dt: number, state: AnimState, moveSpeedRatio: number): void {
    this.animTime += dt;
    if (this.attackSwingTimer > 0) {
      this.attackSwingTimer = Math.max(0, this.attackSwingTimer - dt);
      this.attackSwingPhase = 1 - this.attackSwingTimer / 0.36;
    }
    if (this.weaponUnsheathedTimer > 0) {
      this.weaponUnsheathedTimer = Math.max(0, this.weaponUnsheathedTimer - dt);
    }

    // Dynamic Weapon Sheathing (in hand while fighting, floating cleanly on back while exploring!)
    const inHand = this.weaponUnsheathedTimer > 0 || state === 'plunge';
    if (this.weaponInHandMesh && this.weaponOnBackMesh) {
      this.weaponInHandMesh.visible = inHand;
      this.weaponOnBackMesh.visible = !inHand && state !== 'glide';
      if (!inHand) {
        this.weaponBack.position.y = 0.32 + Math.sin(this.animTime * 2.4) * 0.03;
      }
    }

    if (this.shieldMesh.visible) {
      this.shieldMesh.rotation.y += dt * 0.65;
    }
    if (this.altSprintGroup.visible) {
      this.altSprintGroup.rotation.y += dt * 5.2;
    }

    if (this.catalystOrbGroup) {
      this.catalystOrbGroup.position.y = 0.36 + Math.sin(this.animTime * 2.8) * 0.07;
      this.catalystOrbGroup.rotation.y += dt * 1.4;
    }

    const gliding = state === 'glide';
    this.gliderGroup.visible = gliding;
    if (gliding) {
      const flap = Math.sin(this.animTime * 4.5) * 0.07;
      this.leftWing.rotation.y = -0.15 + flap;
      this.rightWing.rotation.y = 0.15 - flap;
    }

    const lerpRate = Math.min(1, dt * 14);
    const lerpRot = (obj: THREE.Object3D, x: number, y: number, z: number) => {
      obj.rotation.x += (x - obj.rotation.x) * lerpRate;
      obj.rotation.y += (y - obj.rotation.y) * lerpRate;
      obj.rotation.z += (z - obj.rotation.z) * lerpRate;
    };

    let hipsY = 0.92;
    let torsoX = 0;
    let torsoY = 0;
    let headX = 0;
    let lArmX = 0;
    let rArmX = 0;
    let lArmZ = 0.12;
    let rArmZ = -0.12;
    let lLegX = 0;
    let rLegX = 0;
    let capeX = 0.1;

    if (state === 'idle') {
      hipsY = 0.92 + Math.sin(this.animTime * 2.1) * 0.014;
      lArmX = Math.sin(this.animTime * 2.1) * 0.03;
      rArmX = -Math.sin(this.animTime * 2.1) * 0.03;
      capeX = 0.08 + Math.sin(this.animTime * 2.3) * 0.04;
    } else if (state === 'walk' || state === 'run' || state === 'sprint') {
      const freq = state === 'sprint' ? 13.5 : state === 'run' ? 9.5 : 6.2;
      const amp = state === 'sprint' ? 0.96 : state === 'run' ? 0.72 : 0.42;
      const s = Math.sin(this.animTime * freq);
      hipsY = 0.91 + Math.abs(Math.cos(this.animTime * freq)) * 0.045;
      torsoX = state === 'sprint' ? 0.3 : 0.12 * moveSpeedRatio;
      lLegX = s * amp;
      rLegX = -s * amp;
      lArmX = -s * amp * 0.8;
      rArmX = s * amp * 0.8;
      capeX = state === 'sprint' ? 0.7 + Math.sin(this.animTime * 12) * 0.12 : 0.36;
    } else if (state === 'jump' || state === 'fall') {
      torsoX = 0.1;
      lArmZ = 0.55;
      rArmZ = -0.55;
      lLegX = 0.25;
      rLegX = -0.35;
      capeX = 0.48;
    } else if (state === 'glide') {
      torsoX = 0.22;
      lArmX = -1.45;
      rArmX = -1.45;
      lArmZ = 0.5;
      rArmZ = -0.5;
      lLegX = 0.18 + Math.sin(this.animTime * 3) * 0.05;
      rLegX = 0.26 - Math.sin(this.animTime * 3) * 0.05;
      capeX = 0.76 + Math.sin(this.animTime * 7) * 0.12;
    } else if (state === 'climb') {
      const c = Math.sin(this.animTime * 8 * Math.max(0.2, moveSpeedRatio));
      torsoX = 0.08;
      lArmX = -1.85 + c * 0.45;
      rArmX = -1.85 - c * 0.45;
      lLegX = -0.35 - c * 0.45;
      rLegX = -0.35 + c * 0.45;
    } else if (state === 'swim') {
      const moving = moveSpeedRatio > 0.08;
      const freq = moving ? 6.8 : 2.6;
      const s = Math.sin(this.animTime * freq);
      const c = Math.cos(this.animTime * freq);
      if (moving) {
        hipsY = 0.76 + s * 0.03;
        torsoX = 0.72;
        headX = -0.58;
        lArmX = -1.45 + s * 0.95;
        rArmX = -1.45 - s * 0.95;
        lArmZ = 0.35 + c * 0.25;
        rArmZ = -0.35 - c * 0.25;
        lLegX = s * 0.62;
        rLegX = -s * 0.62;
        capeX = 0.45;
      } else {
        // Upright buoyant water treading
        hipsY = 0.78 + s * 0.05;
        torsoX = 0.14;
        headX = -0.1;
        lArmX = -0.45 + s * 0.25;
        rArmX = -0.45 - s * 0.25;
        lArmZ = 0.65 + c * 0.22;
        rArmZ = -0.65 - c * 0.22;
        lLegX = s * 0.32;
        rLegX = -s * 0.32;
        capeX = 0.25;
      }
    } else if (state === 'plunge') {
      torsoX = 0.45;
      rArmX = -2.2;
      lArmX = -1.4;
      capeX = 0.88;
    }

    if (this.attackSwingTimer > 0) {
      const p = this.attackSwingPhase;
      const swingDir = this.attackComboIdx % 2 === 0 ? 1 : -1;
      torsoY = swingDir * (p - 0.5) * 1.15;
      torsoX = 0.22;
      rArmX = -1.75 + p * 2.35;
      rArmZ = swingDir * (-0.9 + p * 1.4);
      lArmX = -0.6;
    } else if (state === 'skill' || state === 'burst') {
      torsoX = -0.15;
      lArmX = -1.6;
      rArmX = -2.0;
      lArmZ = 0.6;
      rArmZ = -0.6;
      capeX = 0.75;
    }

    this.hips.position.y += (hipsY - this.hips.position.y) * lerpRate;
    lerpRot(this.torso, torsoX, torsoY, 0);
    lerpRot(this.headGroup, headX, 0, 0);
    lerpRot(this.leftArm, lArmX, 0, lArmZ);
    lerpRot(this.rightArm, rArmX, 0, rArmZ);
    lerpRot(this.leftLeg, lLegX, 0, 0);
    lerpRot(this.rightLeg, rLegX, 0, 0);
    lerpRot(this.capePivot, capeX, 0, 0);
    lerpRot(this.hairTailPivot, capeX * 0.68, 0, 0);
  }

  private createAnimeFaceTexture(def: CharacterDef): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 256);

    const eyeHex = '#' + def.colors.eye.toString(16).padStart(6, '0');

    for (const side of [-1, 1]) {
      const cx = 128 + side * 44;
      const cy = 122;

      ctx.strokeStyle = '#1b1420';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 2, 22, 18, 0, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 18, 17, 0, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createLinearGradient(cx, cy - 12, cx, cy + 20);
      grad.addColorStop(0, '#161124');
      grad.addColorStop(0.45, eyeHex);
      grad.addColorStop(1, '#fff3b8');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 12.5, 14.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#130e1c';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 5.5, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 3, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 5, cy + 10, 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#' + def.colors.hairShadow.toString(16).padStart(6, '0');
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy - 26);
      ctx.quadraticCurveTo(cx, cy - 32, cx + 16, cy - 25);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 130, 140, 0.28)';
      ctx.beginPath();
      ctx.ellipse(cx + side * 6, cy + 28, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(180, 115, 95, 0.55)';
    ctx.beginPath();
    ctx.arc(128, 152, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#9c524b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 169, 11, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
