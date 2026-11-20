import * as THREE from 'three';

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenithColor;
uniform vec3 uMidColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uNightFactor;

varying vec3 vWorldDir;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.04;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldDir);
  float h = clamp(dir.y, 0.0, 1.0);

  vec3 sky = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.28, h));
  sky = mix(sky, uZenithColor, smoothstep(0.25, 0.88, h));

  // Sun glow & crisp disc
  float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
  float mie = pow(sunDot, 10.0) * 0.42 + pow(sunDot, 90.0) * 0.55;
  float disc = smoothstep(0.9991, 0.99965, sunDot);
  sky += uSunColor * (mie + disc * 1.4) * (1.0 - uNightFactor * 0.85);

  // Night crescent moon & stars
  if (uNightFactor > 0.05 && dir.y > 0.02) {
    vec3 moonDir = normalize(vec3(-uSunDir.x, abs(uSunDir.y) + 0.35, -uSunDir.z));
    float mDot = dot(dir, moonDir);
    float moonDisc = smoothstep(0.9985, 0.9992, mDot);
    float cutDot = dot(dir, normalize(moonDir + vec3(0.028, 0.014, 0.0)));
    float moonCut = smoothstep(0.9985, 0.9992, cutDot);
    float crescent = max(0.0, moonDisc - moonCut * 0.92);
    sky += vec3(0.88, 0.94, 1.0) * crescent * uNightFactor * 1.5;

    // Twinkling stars
    vec2 starUv = dir.xz / (dir.y + 0.35) * 42.0;
    vec2 starCell = floor(starUv);
    float starRnd = hash21(starCell);
    if (starRnd > 0.965) {
      vec2 center = fract(starUv) - 0.5;
      float d = length(center);
      float twinkle = 0.6 + 0.4 * sin(uTime * 2.6 + starRnd * 50.0);
      float star = smoothstep(0.18, 0.02, d) * twinkle;
      sky += vec3(0.85, 0.92, 1.0) * star * uNightFactor * smoothstep(0.04, 0.25, dir.y);
    }
  }

  // Painterly anime cumulus clouds
  if (dir.y > 0.03) {
    vec2 cloudUv = dir.xz / (dir.y + 0.22) * 1.15;
    cloudUv += vec2(uTime * 0.012, uTime * 0.005);
    float c1 = fbm(cloudUv * 1.4);
    float c2 = fbm(cloudUv * 2.9 - vec2(uTime * 0.008, 0.0));
    float cloudMask = smoothstep(0.50, 0.72, c1 * 0.72 + c2 * 0.32);
    float cloudLit = smoothstep(0.35, 0.78, c1 + sunDot * 0.28);

    vec3 dayCloudLight = mix(vec3(0.98, 0.99, 1.0), uSunColor, 0.28);
    vec3 dayCloudShadow = mix(uMidColor, vec3(0.75, 0.84, 0.96), 0.55);
    vec3 cloudColor = mix(dayCloudShadow, dayCloudLight, cloudLit);
    cloudColor = mix(cloudColor, vec3(0.16, 0.21, 0.34), uNightFactor * 0.82);

    float horizonFade = smoothstep(0.03, 0.22, dir.y);
    sky = mix(sky, cloudColor, cloudMask * 0.78 * horizonFade);
  }

  gl_FragColor = vec4(sky, 1.0);
}
`;

export class SkySystem {
  public timeOfDay = 10.8; // Hours 0..24
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly fog: THREE.FogExp2;
  public readonly skyMesh: THREE.Mesh;

  public readonly sunDirection = new THREE.Vector3(0.5, 0.7, 0.4).normalize();
  public readonly sunColor = new THREE.Color(0xfff5de);
  private readonly uniforms: {
    uSunDir: { value: THREE.Vector3 };
    uZenithColor: { value: THREE.Color };
    uMidColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uSunColor: { value: THREE.Color };
    uTime: { value: number };
    uNightFactor: { value: number };
  };

  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      uSunDir: { value: this.sunDirection },
      uZenithColor: { value: new THREE.Color(0x2878d8) },
      uMidColor: { value: new THREE.Color(0x63b8f7) },
      uHorizonColor: { value: new THREE.Color(0xbce8ff) },
      uSunColor: { value: this.sunColor },
      uTime: { value: 0 },
      uNightFactor: { value: 0 },
    };

    const skyGeo = new THREE.SphereGeometry(385, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.frustumCulled = false;
    scene.add(this.skyMesh);

    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 2.35);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 210;
    const d = 58;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.04;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.hemiLight = new THREE.HemisphereLight(0x88ccff, 0x5c7f3c, 1.05);
    scene.add(this.hemiLight);

    this.fog = new THREE.FogExp2(0xbce8ff, 0.0038);
    scene.fog = this.fog;

    this.applyLighting();
  }

  public setTimeOfDay(hour: number): void {
    this.timeOfDay = ((hour % 24) + 24) % 24;
    this.applyLighting();
  }

  public update(dt: number, playerPos: THREE.Vector3, cameraPos: THREE.Vector3, autoAdvance = false): void {
    this.elapsed += dt;
    this.uniforms.uTime.value = this.elapsed;

    if (autoAdvance) {
      this.timeOfDay = (this.timeOfDay + dt * 0.016) % 24;
    }
    this.applyLighting();

    this.skyMesh.position.copy(cameraPos);

    // Texel-quantized shadow follow to prevent shadow edge shimmer
    const texelSize = 116 / 2048;
    const qx = Math.round(playerPos.x / texelSize) * texelSize;
    const qz = Math.round(playerPos.z / texelSize) * texelSize;

    this.sunLight.target.position.set(qx, playerPos.y, qz);
    this.sunLight.target.updateMatrixWorld();

    const lightDir = this.sunDirection.y > 0.05 ? this.sunDirection : new THREE.Vector3(-this.sunDirection.x, 0.45, -this.sunDirection.z).normalize();
    this.sunLight.position.set(
      qx + lightDir.x * 95,
      playerPos.y + Math.max(22, lightDir.y * 95),
      qz + lightDir.z * 95,
    );
  }

  private applyLighting(): void {
    // Convert hour to solar elevation: 6=sunrise, 12=zenith, 18=sunset
    const angle = ((this.timeOfDay - 6) / 24) * Math.PI * 2;
    const elev = Math.sin(angle);
    const horiz = Math.cos(angle);

    this.sunDirection.set(horiz * 0.85, elev, -0.45).normalize();

    const dayT = Math.max(0, Math.min(1, (elev + 0.08) / 0.52));
    const sunsetT = Math.max(0, 1 - Math.abs(elev - 0.08) * 3.8);
    const nightT = Math.max(0, Math.min(1, (-elev + 0.02) / 0.35));

    this.uniforms.uNightFactor.value = nightT;

    const zenithDay = new THREE.Color(0x2878d8);
    const midDay = new THREE.Color(0x63b8f7);
    const horizDay = new THREE.Color(0xbce8ff);

    const zenithSunset = new THREE.Color(0x3f437e);
    const midSunset = new THREE.Color(0xe67a63);
    const horizSunset = new THREE.Color(0xffbe74);

    const zenithNight = new THREE.Color(0x070d20);
    const midNight = new THREE.Color(0x101c3b);
    const horizNight = new THREE.Color(0x1f3056);

    const zCol = zenithNight.clone().lerp(zenithDay, dayT).lerp(zenithSunset, sunsetT * 0.85);
    const mCol = midNight.clone().lerp(midDay, dayT).lerp(midSunset, sunsetT * 0.9);
    const hCol = horizNight.clone().lerp(horizDay, dayT).lerp(horizSunset, sunsetT);

    this.uniforms.uZenithColor.value.copy(zCol);
    this.uniforms.uMidColor.value.copy(mCol);
    this.uniforms.uHorizonColor.value.copy(hCol);

    const sCol = new THREE.Color(0xfff6e0).lerp(new THREE.Color(0xff9b54), sunsetT);
    this.sunColor.copy(sCol);
    this.uniforms.uSunColor.value.copy(sCol);

    // Scene lights
    if (nightT > 0.5) {
      this.sunLight.color.setHex(0x8bb4ff);
      this.sunLight.intensity = 0.85;
      this.hemiLight.color.setHex(0x3a5890);
      this.hemiLight.groundColor.setHex(0x1c2930);
      this.hemiLight.intensity = 0.72;
    } else {
      this.sunLight.color.copy(sCol);
      this.sunLight.intensity = 1.65 + dayT * 0.8;
      this.hemiLight.color.copy(mCol);
      this.hemiLight.groundColor.setHex(0x5d8242);
      this.hemiLight.intensity = 0.85 + dayT * 0.25;
    }

    this.fog.color.copy(hCol);
    this.fog.density = 0.0036 + sunsetT * 0.0008 + nightT * 0.0007;
  }
}
