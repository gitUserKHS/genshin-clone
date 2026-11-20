/**
 * Deterministic 2D gradient / Simplex-style value noise utility for terrain, clouds, and placement.
 */
export class Noise2D {
  private readonly perm: Uint8Array;

  constructor(seed = 1337) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    let s = seed >>> 0;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private static fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private grad(hash: number, x: number, y: number): number {
    switch (hash & 7) {
      case 0:
        return x + y;
      case 1:
        return -x + y;
      case 2:
        return x - y;
      case 3:
        return -x - y;
      case 4:
        return x;
      case 5:
        return -x;
      case 6:
        return y;
      default:
        return -y;
    }
  }

  /** Returns roughly [-1, 1] smooth 2D gradient noise. */
  public noise2D(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = Noise2D.fade(xf);
    const v = Noise2D.fade(yf);

    const aa = this.perm[this.perm[xi] + yi];
    const ab = this.perm[this.perm[xi] + yi + 1];
    const ba = this.perm[this.perm[xi + 1] + yi];
    const bb = this.perm[this.perm[xi + 1] + yi + 1];

    const x1 = Noise2D.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
    const x2 = Noise2D.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);

    return Noise2D.lerp(x1, x2, v) * 0.72;
  }

  /** Fractional Brownian Motion in roughly [-1, 1]. */
  public fbm(x: number, y: number, octaves = 4, lacunarity = 2.0, gain = 0.5): number {
    let sum = 0;
    let amp = 1.0;
    let freq = 1.0;
    let maxAmp = 0;

    for (let i = 0; i < octaves; i++) {
      sum += this.noise2D(x * freq, y * freq) * amp;
      maxAmp += amp;
      amp *= gain;
      freq *= lacunarity;
    }

    return sum / maxAmp;
  }

  /** Ridged multifractal noise in [0, 1] for cliffs and mountain spines. */
  public ridged(x: number, y: number, octaves = 4): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1.0;
    let weight = 1.0;
    let maxAmp = 0;

    for (let i = 0; i < octaves; i++) {
      let n = 1.0 - Math.abs(this.noise2D(x * freq, y * freq));
      n = n * n * weight;
      weight = Math.max(0.0, Math.min(1.0, n * 1.8));
      sum += n * amp;
      maxAmp += amp;
      amp *= 0.5;
      freq *= 2.1;
    }

    return sum / maxAmp;
  }
}
