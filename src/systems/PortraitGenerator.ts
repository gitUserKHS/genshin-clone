import { ALL_CHARACTERS, CHARACTERS, WEAPONS } from '../characters/CharacterData';
import { ELEMENT_COLORS, type CharacterId } from '../core/Types';

const portraitCache: Partial<Record<CharacterId, string>> = {};
const weaponIconCache: Record<string, string> = {};

function hexToCss(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

export function getCharacterPortrait(id: CharacterId): string {
  const existing = portraitCache[id];
  if (existing) return existing;

  const def = CHARACTERS[id];
  const elemCss = ELEMENT_COLORS[def.element].css;
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 180;
  const ctx = canvas.getContext('2d')!;

  // Rich elemental starry portrait gradient
  const bg = ctx.createRadialGradient(90, 62, 12, 90, 90, 108);
  bg.addColorStop(0, elemCss);
  bg.addColorStop(0.55, '#1e2742');
  bg.addColorStop(1, '#0e1324');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 180, 180);

  // Decorative constellation ring
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(90, 90, 74, 0, Math.PI * 2);
  ctx.stroke();

  // Back hair silhouette
  ctx.fillStyle = hexToCss(def.colors.hairShadow);
  ctx.beginPath();
  ctx.ellipse(90, 96, 46, 54, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outfit collar & shoulders
  ctx.fillStyle = hexToCss(def.colors.outfitPrimary);
  ctx.beginPath();
  ctx.moveTo(28, 180);
  ctx.quadraticCurveTo(90, 126, 152, 180);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hexToCss(def.colors.accent);
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(58, 140);
  ctx.lineTo(90, 162);
  ctx.lineTo(122, 140);
  ctx.stroke();

  // Neck & Anime Face
  ctx.fillStyle = hexToCss(def.colors.skin);
  ctx.fillRect(79, 114, 22, 26);
  ctx.beginPath();
  ctx.ellipse(90, 82, 32, 36, 0, 0, Math.PI * 2);
  ctx.fill();

  // Anime eyes
  const eyeCss = hexToCss(def.colors.eye);
  for (const s of [-1, 1]) {
    const ex = 90 + s * 14;
    const ey = 84;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 7.2, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeCss;
    ctx.beginPath();
    ctx.ellipse(ex, ey + 0.5, 5, 5.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#140f1e';
    ctx.beginPath();
    ctx.arc(ex, ey + 0.5, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - 1.8, ey - 1.8, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Eyelash
    ctx.strokeStyle = '#191322';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(ex, ey - 1, 7.5, 5.5, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }

  // Smile
  ctx.strokeStyle = '#9c524b';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(90, 102, 5.5, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // Layered bangs
  ctx.fillStyle = hexToCss(def.colors.hair);
  ctx.beginPath();
  ctx.arc(90, 68, 36, Math.PI, Math.PI * 2);
  ctx.lineTo(128, 82);
  ctx.lineTo(110, 62);
  ctx.lineTo(90, 80);
  ctx.lineTo(70, 62);
  ctx.lineTo(52, 82);
  ctx.closePath();
  ctx.fill();

  // Signature headgear / hair accessories
  if (def.hasHat) {
    ctx.fillStyle = hexToCss(def.colors.outfitPrimary);
    ctx.beginPath();
    ctx.ellipse(90, 42, 54, 11, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(62, 40);
    ctx.lineTo(88, 10);
    ctx.lineTo(116, 40);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hexToCss(def.colors.accent);
    ctx.lineWidth = 2.2;
    ctx.stroke();
  } else if (def.hairStyle === 'catbuns') {
    for (const s of [-1, 1]) {
      ctx.fillStyle = hexToCss(def.colors.hair);
      ctx.beginPath();
      ctx.moveTo(90 + s * 16, 40);
      ctx.lineTo(90 + s * 32, 20);
      ctx.lineTo(90 + s * 36, 46);
      ctx.closePath();
      ctx.fill();
    }
  } else if (def.hairStyle === 'himecut') {
    // Ayaka side hime-cut locks & crimson ribbon
    ctx.fillStyle = hexToCss(def.colors.hair);
    ctx.fillRect(50, 72, 11, 44);
    ctx.fillRect(119, 72, 11, 44);
    ctx.fillStyle = hexToCss(def.colors.accent);
    ctx.beginPath();
    ctx.arc(90, 32, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (def.hairStyle === 'longtail') {
    // Zhongli golden amber hair tips & noble collar gem
    ctx.fillStyle = '#f5b83d';
    ctx.beginPath();
    ctx.arc(90, 148, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const url = canvas.toDataURL('image/png');
  portraitCache[id] = url;
  return url;
}

export function getWeaponIcon(weaponId: string): string {
  if (weaponIconCache[weaponId]) return weaponIconCache[weaponId];
  const w = WEAPONS[weaponId];
  if (!w) return '';

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const bgColors = {
    3: ['#2c4a6e', '#1a283b'],
    4: ['#583a80', '#2b1c40'],
    5: ['#a66c24', '#472a0b'],
  }[w.rarity];
  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, bgColors[0]);
  grad.addColorStop(1, bgColors[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  ctx.save();
  ctx.translate(64, 64);
  ctx.rotate(-Math.PI / 4);

  if (w.type === 'catalyst') {
    ctx.fillStyle = hexToCss(w.color);
    ctx.fillRect(-20, -24, 40, 48);
    ctx.strokeStyle = hexToCss(w.accentColor);
    ctx.lineWidth = 4;
    ctx.strokeRect(-20, -24, 40, 48);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.stroke();
  } else if (w.type === 'polearm') {
    ctx.fillStyle = hexToCss(w.color);
    ctx.fillRect(-3, -24, 6, 76);
    ctx.fillStyle = hexToCss(w.accentColor);
    ctx.beginPath();
    ctx.moveTo(0, -56);
    ctx.lineTo(11, -24);
    ctx.lineTo(-11, -24);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-10, -26, 20, 5);
  } else {
    const bw = w.type === 'claymore' ? 14 : 8;
    ctx.fillStyle = hexToCss(w.color);
    ctx.beginPath();
    ctx.moveTo(-bw / 2, 18);
    ctx.lineTo(-bw / 2, -40);
    ctx.lineTo(0, -54);
    ctx.lineTo(bw / 2, -40);
    ctx.lineTo(bw / 2, 18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hexToCss(w.accentColor);
    ctx.fillRect(-16, 16, 32, 7);
    ctx.fillRect(-4, 23, 8, 22);
  }
  ctx.restore();

  const url = canvas.toDataURL('image/png');
  weaponIconCache[weaponId] = url;
  return url;
}

export function warmPortraitCache(): void {
  for (const id of ALL_CHARACTERS) getCharacterPortrait(id);
  for (const id of Object.keys(WEAPONS)) getWeaponIcon(id);
}
