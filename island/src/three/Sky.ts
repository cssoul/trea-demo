import * as THREE from 'three'

export class Sky {
  mesh: THREE.Mesh
  private uniforms: {
    topColor: { value: THREE.Color }
    midColor: { value: THREE.Color }
    bottomColor: { value: THREE.Color }
    cloudColor: { value: THREE.Color }
    time: { value: number }
    offset: { value: number }
    exponent: { value: number }
  }

  constructor() {
    const geometry = new THREE.SphereGeometry(500, 32, 16)

    this.uniforms = {
      topColor: { value: new THREE.Color(0x1a6fc4) },
      midColor: { value: new THREE.Color(0x4da3e0) },
      bottomColor: { value: new THREE.Color(0x9fd0f0) },
      cloudColor: { value: new THREE.Color(0xffffff) },
      time: { value: 0 },
      offset: { value: 10 },
      exponent: { value: 0.7 },
    }

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vLocalPos;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform vec3 cloudColor;
        uniform float time;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        varying vec3 vLocalPos;

        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ * ns.x + ns.yyyy;
          vec4 y = y_ * ns.x + ns.yyyy;
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

        float fbm(vec3 p) {
          float f = 0.0;
          f += 0.5 * snoise(p);
          f += 0.25 * snoise(p * 2.0);
          f += 0.125 * snoise(p * 4.0);
          f += 0.0625 * snoise(p * 8.0);
          return f;
        }

        void main() {
          float h = normalize(vWorldPosition + offset).y;
          float t = max(pow(max(h, 0.0), exponent), 0.0);
          vec3 color;
          if (t < 0.5) {
            color = mix(bottomColor, midColor, t * 2.0);
          } else {
            color = mix(midColor, topColor, (t - 0.5) * 2.0);
          }

          vec3 dir = normalize(vLocalPos);
          float cloudArea = smoothstep(-0.1, 0.25, dir.y);
          float longitude = atan(dir.z, dir.x);
          float latitude = asin(clamp(dir.y, -1.0, 1.0));
          vec2 cloudUV = vec2(longitude, latitude) * 2.0 + vec2(time * 0.003, time * 0.001);
          float cloudNoise = fbm(vec3(cloudUV * 1.2, 0.0));
          cloudNoise = smoothstep(-0.1, 0.35, cloudNoise);
          float cloudCoverage = cloudNoise * cloudArea * 0.8;

          vec3 cloudShade = cloudColor * 0.92;
          vec3 finalCloud = mix(cloudShade, cloudColor, smoothstep(0.2, 0.7, cloudNoise));
          color = mix(color, finalCloud, cloudCoverage);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    })

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.renderOrder = -1
  }

  update(time: number) {
    this.uniforms.time.value = time
  }
}
