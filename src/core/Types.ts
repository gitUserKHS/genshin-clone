import type * as THREE from 'three';

export type ElementType = 'anemo' | 'pyro' | 'hydro' | 'electro' | 'cryo' | 'geo' | 'physical';

export const ELEMENT_COLORS: Record<ElementType, { hex: number; css: string; labelKr: string; symbol: string }> = {
  anemo: { hex: 0x4ae3b5, css: '#4ae3b5', labelKr: '바람', symbol: '🌪' },
  pyro: { hex: 0xff6b3d, css: '#ff6b3d', labelKr: '불', symbol: '🔥' },
  hydro: { hex: 0x38b6ff, css: '#38b6ff', labelKr: '물', symbol: '💧' },
  electro: { hex: 0xc57bff, css: '#c57bff', labelKr: '번개', symbol: '⚡' },
  cryo: { hex: 0x8ceeff, css: '#8ceeff', labelKr: '얼음', symbol: '❄' },
  geo: { hex: 0xf0be54, css: '#f0be54', labelKr: '바위', symbol: '◆' },
  physical: { hex: 0xffffff, css: '#ffffff', labelKr: '물리', symbol: '✦' },
};

export type WeaponType = 'sword' | 'claymore' | 'catalyst' | 'polearm';

export type CharacterId = 'traveler' | 'diluc' | 'mona' | 'keqing' | 'ayaka' | 'zhongli';

export type HairStyle = 'braid' | 'ponytail' | 'twintails' | 'catbuns' | 'himecut' | 'longtail';

export type AlternateSprintType = 'none' | 'hydro' | 'cryo';

export interface CharacterColors {
  skin: number;
  hair: number;
  hairShadow: number;
  eye: number;
  outfitPrimary: number;
  outfitSecondary: number;
  accent: number;
  cape: number;
}

export interface CharacterDef {
  id: CharacterId;
  nameKr: string;
  titleKr: string;
  element: ElementType;
  weaponType: WeaponType;
  rarity: 5;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  critRate: number;
  critDmg: number;
  skillNameKr: string;
  skillDescKr: string;
  skillCooldown: number;
  burstNameKr: string;
  burstDescKr: string;
  burstCost: number;
  burstCooldown: number;
  colors: CharacterColors;
  hairStyle: HairStyle;
  hasHat: boolean;
  altSprint: AlternateSprintType;
}

export type ArtifactSetId =
  | 'viridescent'
  | 'crimson_witch'
  | 'emblem'
  | 'blizzard'
  | 'archaic_petra';

export interface ArtifactSetDef {
  id: ArtifactSetId;
  nameKr: string;
  elementAffinity: ElementType;
  bonusDescKr: string;
  atkPct: number;
  critRateBonus: number;
  critDmgBonus: number;
  elemDmgBonus: number;
  colorCss: string;
}

export interface CharacterRuntime {
  id: CharacterId;
  level: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  skillCd: number;
  burstCd: number;
  constellation: number;
  weaponId: string;
  weaponRefine: number;
  artifactSetId: ArtifactSetId;
  infusionTimer: number;
  infusionElement: ElementType | null;
  isAlive: boolean;
}

export interface WeaponDef {
  id: string;
  nameKr: string;
  type: WeaponType;
  rarity: 3 | 4 | 5;
  baseAtk: number;
  subStatLabel: string;
  critBonus: number;
  elemBonus: number;
  color: number;
  accentColor: number;
}

export interface ElementalAura {
  element: ElementType;
  gauge: number;
  timer: number;
}

export type ReactionType =
  | 'vaporize'
  | 'melt'
  | 'overloaded'
  | 'electroCharged'
  | 'swirl'
  | 'frozen'
  | 'superconduct'
  | 'crystallize';

export interface ShieldState {
  hp: number;
  maxHp: number;
  element: ElementType;
  timer: number;
}

export interface WorldPoint {
  id: string;
  nameKr: string;
  x: number;
  z: number;
  type: 'statue' | 'waypoint' | 'landmark' | 'boss' | 'domain';
}

export interface InteractablePrompt {
  id: string;
  label: string;
  subLabel?: string;
  icon: string;
  action: () => void;
  distance: number;
}

export interface QuestDef {
  id: string;
  titleKr: string;
  descKr: string;
  current: number;
  target: number;
  completed: boolean;
  rewardPrimogems: number;
}

export type GraphicsQuality = 'low' | 'high' | 'ultra';

export type ModalPanel =
  | 'none'
  | 'menu'
  | 'map'
  | 'wish'
  | 'character'
  | 'bag'
  | 'party'
  | 'time'
  | 'controls'
  | 'cooking'
  | 'domain'
  | 'photo';

export interface CylinderCollider {
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
  walkableTop?: boolean;
}

export interface BoxCollider {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  rotY: number;
  minY: number;
  maxY: number;
  walkableTop?: boolean;
}

export interface CollisionWorld {
  cylinders: CylinderCollider[];
  boxes: BoxCollider[];
}

export interface UpdraftVolume {
  x: number;
  z: number;
  baseY: number;
  topY: number;
  radius: number;
}

export interface EnemySnapshot {
  id: string;
  nameKr: string;
  level: number;
  isBoss: boolean;
  hp: number;
  maxHp: number;
  shieldHp: number;
  shieldMaxHp: number;
  shieldElement: ElementType | null;
  aura: ElementalAura | null;
  worldPos: THREE.Vector3;
  heightOffset: number;
  aggroed: boolean;
  frozen: boolean;
  petrified: boolean;
  defDownTimer: number;
  omenTimer: number;
  campId?: string;
}

export interface ActiveChallengeHUD {
  titleKr: string;
  descKr: string;
  timeLeft: number;
  progress: number;
  target: number;
}
