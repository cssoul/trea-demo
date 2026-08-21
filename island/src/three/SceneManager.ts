import * as THREE from 'three'
import { Sky } from './Sky'
import { Ocean } from './Ocean'
import { Island } from './Island'
import { FishSchool } from './Fish'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class SceneManager {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls

  private sky: Sky
  private ocean: Ocean
  private island: Island
  private fish: FishSchool

  private animationId: number = 0
  private container: HTMLElement
  private startTime: number

  constructor(container: HTMLElement) {
    this.container = container
    this.startTime = performance.now()

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x9fd0f0, 0.002)

    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    )
    this.camera.position.set(0, 70, 165)
    this.camera.lookAt(0, 0, 25)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    })
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 30
    this.controls.maxDistance = 250
    this.controls.maxPolarAngle = Math.PI / 2.15
    this.controls.minPolarAngle = Math.PI / 6
    this.controls.target.set(0, 0, 25)
    this.controls.update()

    this.setupLights()

    this.sky = new Sky()
    this.scene.add(this.sky.mesh)

    this.ocean = new Ocean()
    this.scene.add(this.ocean.mesh)

    this.island = new Island()
    this.scene.add(this.island.group)

    this.fish = new FishSchool()
    this.scene.add(this.fish.group)

    this.onResize = this.onResize.bind(this)
    window.addEventListener('resize', this.onResize)

    this.animate = this.animate.bind(this)
    this.animate()
  }

  private setupLights() {
    const ambientLight = new THREE.AmbientLight(0xb0d4f1, 0.6)
    this.scene.add(ambientLight)

    const sunLight = new THREE.DirectionalLight(0xfff5e0, 2.0)
    sunLight.position.set(60, 120, 80)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = 4096
    sunLight.shadow.mapSize.height = 4096
    sunLight.shadow.camera.near = 10
    sunLight.shadow.camera.far = 350
    sunLight.shadow.camera.left = -120
    sunLight.shadow.camera.right = 120
    sunLight.shadow.camera.top = 120
    sunLight.shadow.camera.bottom = -120
    sunLight.shadow.bias = -0.0005
    sunLight.shadow.normalBias = 0.02
    this.scene.add(sunLight)

    const fillLight = new THREE.DirectionalLight(0x8ecae6, 0.4)
    fillLight.position.set(-60, 50, -40)
    this.scene.add(fillLight)

    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0xf5deb3, 0.5)
    this.scene.add(hemiLight)
  }

  private onResize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  private animate() {
    this.animationId = requestAnimationFrame(this.animate)
    const elapsed = (performance.now() - this.startTime) * 0.001

    this.ocean.update(elapsed)
    this.sky.update(elapsed)
    this.fish.update(elapsed)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    cancelAnimationFrame(this.animationId)
    window.removeEventListener('resize', this.onResize)
    this.controls.dispose()
    this.fish.dispose()
    this.scene.clear()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
    }
  }
}
