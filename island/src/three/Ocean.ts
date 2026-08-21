import * as THREE from 'three'

export class Ocean {
  mesh: THREE.Mesh
  private geometry: THREE.PlaneGeometry
  private uniforms: {
    uTime: { value: number }
    uDeepColor: { value: THREE.Color }
    uMidColor: { value: THREE.Color }
    uShallowColor: { value: THREE.Color }
    uReefColor: { value: THREE.Color }
    uSandColor: { value: THREE.Color }
    uCenter: { value: THREE.Vector3 }
    uIslandRadiusX: { value: number }
    uIslandRadiusZ: { value: number }
  }

  constructor() {
    const size = 500
    const segments = 300

    this.geometry = new THREE.PlaneGeometry(size, size, segments, segments)
    this.geometry.rotateX(-Math.PI / 2)

    this.uniforms = {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(0x003d66) },
      uMidColor: { value: new THREE.Color(0x0088aa) },
      uShallowColor: { value: new THREE.Color(0x22c5c5) },
      uReefColor: { value: new THREE.Color(0x4dd0c8) },
      uSandColor: { value: new THREE.Color(0xe8f4f0) },
      uCenter: { value: new THREE.Vector3(0, 0, 0) },
      uIslandRadiusX: { value: 42 },
      uIslandRadiusZ: { value: 30 },
    }

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime;
        uniform vec3 uCenter;
        uniform float uIslandRadiusX;
        uniform float uIslandRadiusZ;
        varying vec3 vWorldPosition;
        varying float vElevation;
        varying vec2 vPosition;

        vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
        vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v){
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + 1.0 * C.xxx;
          vec3 x2 = x0 - i2 + 2.0 * C.xxx;
          vec3 x3 = x0 - 1. + 3.0 * C.xxx;
          i = mod(i, 289.0);
          vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 1.0/7.0;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          vPosition = position.xz;

          float distX = abs(position.x - uCenter.x) / uIslandRadiusX;
          float distZ = abs(position.z - uCenter.z) / uIslandRadiusZ;
          float distFromIsland = max(distX, distZ);

          float waveHeight = 1.2;
          float n1 = snoise(vec3(position.x * 0.015, position.z * 0.015, uTime * 0.25));
          float n2 = snoise(vec3(position.x * 0.035 + 100.0, position.z * 0.035 + 100.0, uTime * 0.45));
          float n3 = snoise(vec3(position.x * 0.008 - 50.0, position.z * 0.008 - 50.0, uTime * 0.12));
          float smallWaves = snoise(vec3(position.x * 0.12, position.z * 0.12, uTime * 1.2)) * 0.15;

          float elevation = n1 * waveHeight + n2 * waveHeight * 0.4 + n3 * waveHeight * 1.8 + smallWaves;

          float flattenFactor = smoothstep(1.0, 1.6, distFromIsland);
          elevation *= flattenFactor;

          vElevation = elevation;
          vec3 newPosition = position + vec3(0.0, elevation, 0.0);
          vec4 worldPos = modelMatrix * vec4(newPosition, 1.0);
          vWorldPosition = worldPos.xyz;

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uMidColor;
        uniform vec3 uShallowColor;
        uniform vec3 uReefColor;
        uniform vec3 uSandColor;
        uniform vec3 uCenter;
        uniform float uIslandRadiusX;
        uniform float uIslandRadiusZ;
        varying vec3 vWorldPosition;
        varying float vElevation;
        varying vec2 vPosition;

        vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
        vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
        float snoise(vec3 v){
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + 1.0 * C.xxx;
          vec3 x2 = x0 - i2 + 2.0 * C.xxx;
          vec3 x3 = x0 - 1. + 3.0 * C.xxx;
          i = mod(i, 289.0);
          vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 1.0/7.0;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for(int i = 0; i < 5; i++) {
            v += a * snoise(vec3(p, 0.0));
            p *= 2.0;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          float distX = abs(vPosition.x - uCenter.x) / uIslandRadiusX;
          float distZ = abs(vPosition.y - uCenter.z) / uIslandRadiusZ;
          float distFromIsland = max(distX, distZ);
          float distFromCenter = length(vec2(
            (vPosition.x - uCenter.x) / uIslandRadiusX,
            (vPosition.y - uCenter.z) / uIslandRadiusZ
          ));

          vec3 waterColor;
          if (distFromIsland < 1.3) {
            float t = smoothstep(0.8, 1.3, distFromIsland);
            waterColor = mix(uSandColor, uReefColor, t);
          } else if (distFromIsland < 2.5) {
            float t = smoothstep(1.3, 2.5, distFromIsland);
            waterColor = mix(uReefColor, uShallowColor, t);
          } else if (distFromIsland < 5.0) {
            float t = smoothstep(2.5, 5.0, distFromIsland);
            waterColor = mix(uShallowColor, uMidColor, t);
          } else {
            float t = smoothstep(5.0, 10.0, distFromIsland);
            waterColor = mix(uMidColor, uDeepColor, t);
          }

          float reefNoise = fbm(vPosition * 0.03 + 100.0);
          float reefPattern = smoothstep(0.1, 0.5, reefNoise);
          float reefMask = smoothstep(1.05, 1.8, distFromIsland) * (1.0 - smoothstep(3.5, 6.0, distFromIsland));
          waterColor = mix(waterColor, uReefColor * 0.6, reefPattern * reefMask * 0.65);

          float coral1 = fbm(vPosition * 0.08 + vec2(50.0, 30.0));
          float coralPatch = smoothstep(0.3, 0.6, coral1);
          coralPatch *= smoothstep(1.1, 1.6, distFromIsland) * (1.0 - smoothstep(3.0, 4.5, distFromIsland));
          waterColor = mix(waterColor, vec3(0.05, 0.4, 0.35), coralPatch * 0.5);

          float coral2 = fbm(vPosition * 0.12 + vec2(-30.0, 80.0));
          float coralPatch2 = smoothstep(0.4, 0.7, coral2);
          coralPatch2 *= smoothstep(1.3, 2.0, distFromIsland) * (1.0 - smoothstep(4.0, 6.0, distFromIsland));
          waterColor = mix(waterColor, vec3(0.15, 0.5, 0.45), coralPatch2 * 0.35);

          float sandPatch = fbm(vPosition * 0.04 - vec2(20.0, 60.0));
          sandPatch = smoothstep(0.25, 0.55, sandPatch);
          sandPatch *= (1.0 - smoothstep(1.4, 2.2, distFromIsland));
          waterColor = mix(waterColor, uSandColor * 0.85, sandPatch * 0.4);

          float caustic1 = sin(vPosition.x * 0.3 + uTime * 1.5) * sin(vPosition.y * 0.25 - uTime * 1.2);
          float caustic2 = sin(vPosition.x * 0.2 - uTime * 0.8 + vPosition.y * 0.3) * 0.5 + 0.5;
          float caustics = pow(max(caustic1 * caustic2, 0.0), 2.0) * 0.4;
          caustics *= smoothstep(1.0, 3.0, distFromIsland) * (1.0 - smoothstep(5.0, 8.0, distFromIsland));
          waterColor += vec3(caustics) * 0.6;

          float highlight = pow(max(vElevation * 0.6, 0.0), 2.0);
          waterColor += vec3(highlight) * 0.35;

          float streak = sin(vPosition.x * 0.4 + uTime * 1.8 + vPosition.y * 0.25) * 0.5 + 0.5;
          streak = pow(streak, 12.0) * 0.12;
          waterColor += vec3(streak);

          float dist = length(vWorldPosition.xz);
          float fogFactor = smoothstep(180.0, 400.0, dist);
          vec3 fogColor = vec3(0.55, 0.75, 0.92);
          waterColor = mix(waterColor, fogColor, fogFactor);

          float alpha = 0.88;
          alpha += smoothstep(0.8, 1.2, distFromIsland) * 0.07;
          alpha -= fogFactor * 0.3;
          alpha = clamp(alpha, 0.7, 0.95);

          gl_FragColor = vec4(waterColor, alpha);
        }
      `,
    })

    this.mesh = new THREE.Mesh(this.geometry, material)
    this.mesh.receiveShadow = true
  }

  update(time: number) {
    this.uniforms.uTime.value = time
  }
}
