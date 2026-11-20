import * as THREE from 'three';
import { WATER_Y, WORLD_SIZE } from './Terrain';

const WATER_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;
  float wave = sin(pos.x * 0.45 + uTime * 1.8) * 0.06 + cos(pos.y * 0.55 - uTime * 1.4) * 0.05;
  pos.z += wave;
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  vec2 p1 = vWorldPos.xz * 0.24 + vec2(uTime * 0.14, uTime * 0.09);
  vec2 p2 = vWorldPos.xz * 0.36 - vec2(uTime * 0.11, -uTime * 0.12);

  float caustic1 = sin(p1.x * 2.7 + sin(p1.y * 2.3)) * cos(p1.y * 2.6 + cos(p1.x * 2.1));
  float caustic2 = sin(p2.x * 3.1 - cos(p2.y * 2.8)) * cos(p2.y * 2.9 + sin(p2.x * 2.4));
  float caustics = smoothstep(0.35, 0.95, abs(caustic1 + caustic2) * 0.55);

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 normal = normalize(vec3(
    sin(p1.x * 3.0) * 0.08 + cos(p2.y * 3.5) * 0.06,
    1.0,
    cos(p1.y * 3.0) * 0.08 - sin(p2.x * 3.5) * 0.06
  ));

  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
  vec3 deepWater = vec3(0.08, 0.43, 0.62);
  vec3 shallowWater = vec3(0.18, 0.72, 0.79);
  vec3 color = mix(deepWater, shallowWater, 0.45 + fresnel * 0.45);
  color += vec3(0.35, 0.85, 0.95) * caustics * 0.32;

  // Sun specular sparkles
  vec3 halfVec = normalize(normalize(uSunDir) + viewDir);
  float spec = pow(max(dot(normal, halfVec), 0.0), 96.0);
  color += uSunColor * spec * 1.15;

  // Exponential distance fog matching SkySystem
  float dist = length(cameraPosition - vWorldPos);
  float fogFactor = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));

  gl_FragColor = vec4(color, 0.83);
}
`;

export class WaterSystem {
  public readonly seaMesh: THREE.Mesh;
  public readonly statuePoolMesh: THREE.Mesh;
  private readonly uniforms: {
    uTime: { value: number };
    uSunDir: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
    uFogColor: { value: THREE.Color };
    uFogDensity: { value: number };
  };

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.4).normalize() },
      uSunColor: { value: new THREE.Color(0xfff5de) },
      uFogColor: { value: new THREE.Color(0xbce8ff) },
      uFogDensity: { value: 0.0038 },
    };

    const waterMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    });

    const seaGeo = new THREE.PlaneGeometry(WORLD_SIZE + 40, WORLD_SIZE + 40, 80, 80);
    seaGeo.rotateX(-Math.PI / 2);
    this.seaMesh = new THREE.Mesh(seaGeo, waterMat);
    this.seaMesh.position.y = WATER_Y;
    scene.add(this.seaMesh);

    // Statue of The Seven circular reflecting pool at (0, -24), y = 5.52
    const poolGeo = new THREE.RingGeometry(11.1, 19.3, 48, 2);
    poolGeo.rotateX(-Math.PI / 2);
    this.statuePoolMesh = new THREE.Mesh(poolGeo, waterMat);
    this.statuePoolMesh.position.set(0, 5.52, -24);
    scene.add(this.statuePoolMesh);
  }

  public update(dt: number, sunDir: THREE.Vector3, sunColor: THREE.Color, fogColor: THREE.Color, fogDensity: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uFogColor.value.copy(fogColor);
    this.uniforms.uFogDensity.value = fogDensity;
  }
}
