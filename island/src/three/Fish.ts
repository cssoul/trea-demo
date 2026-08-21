import * as THREE from 'three'

interface FishData {
  mesh: THREE.Group
  path: THREE.Vector3[]
  t: number
  speed: number
  depth: number
}

export class FishSchool {
  group: THREE.Group
  private fishes: FishData[] = []
  private time: number = 0

  constructor() {
    this.group = new THREE.Group()
    this.createFish()
  }

  private createFish() {
    const fishColors = [
      0xff6b35, 0xffa500, 0xff4500, 0xffd700,
      0xff8c00, 0xff7f50, 0xff6347, 0xffa07a,
    ]

    const count = 35
    for (let i = 0; i < count; i++) {
      const color = fishColors[i % fishColors.length]
      const fish = this.createSingleFish(color)

      const path = this.createSwimmingPath(i)
      const depth = -0.15 - Math.random() * 0.4

      const fishData: FishData = {
        mesh: fish,
        path,
        t: Math.random(),
        speed: 0.015 + Math.random() * 0.025,
        depth,
      }

      this.fishes.push(fishData)
      this.group.add(fish)
    }
  }

  private createSingleFish(color: number): THREE.Group {
    const fish = new THREE.Group()

    const bodyGeo = new THREE.SphereGeometry(0.65, 12, 8)
    bodyGeo.scale(1.8, 0.7, 0.9)
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.4,
      emissive: color,
      emissiveIntensity: 0.08,
    })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.castShadow = false
    fish.add(body)

    const tailGeo = new THREE.ConeGeometry(0.5, 1.0, 6)
    const tailMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.3,
      side: THREE.DoubleSide,
    })
    const tail = new THREE.Mesh(tailGeo, tailMat)
    tail.position.x = -1.0
    tail.rotation.z = Math.PI / 2
    fish.add(tail)

    const finGeo = new THREE.ConeGeometry(0.25, 0.55, 5)
    const finMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.75),
      roughness: 0.4,
      side: THREE.DoubleSide,
    })
    const topFin = new THREE.Mesh(finGeo, finMat)
    topFin.position.set(0, 0.35, 0)
    topFin.rotation.z = Math.PI
    fish.add(topFin)

    return fish
  }

  private createSwimmingPath(index: number): THREE.Vector3[] {
    const angle = (index / 30) * Math.PI * 2
    const radius = 50 + (index % 5) * 6
    const offset = (index % 7) * 0.5

    const points: THREE.Vector3[] = []
    for (let i = 0; i <= 8; i++) {
      const a = angle + (i / 8) * Math.PI * 2
      const r = radius + Math.sin(a * 3 + offset) * 6
      points.push(
        new THREE.Vector3(
          Math.cos(a) * r,
          -0.5,
          Math.sin(a) * r + 20
        )
      )
    }
    return points
  }

  update(time: number) {
    this.time = time
    for (const fishData of this.fishes) {
      fishData.t += fishData.speed * 0.02

      if (fishData.t > 1) {
        fishData.t = 0
        fishData.path = this.reversePath(fishData.path)
      }

      const pos = this.getPointOnPath(fishData.t, fishData.path)
      fishData.mesh.position.copy(pos)
      fishData.mesh.position.y = fishData.depth + Math.sin(this.time * 2 + fishData.t * 8) * 0.15

      const lookAhead = this.getPointOnPath(
        Math.min(fishData.t + 0.02, 1),
        fishData.path
      )
      const dir = new THREE.Vector3().subVectors(lookAhead, pos)
      if (dir.lengthSq() > 0.001) {
        const angle = Math.atan2(dir.x, dir.z)
        fishData.mesh.rotation.y = angle
      }

      const tail = fishData.mesh.children[1]
      if (tail) {
        tail.rotation.y = Math.sin(this.time * 8 + fishData.t * 15) * 0.4
      }
    }
  }

  private reversePath(path: THREE.Vector3[]): THREE.Vector3[] {
    return [...path].reverse()
  }

  private getPointOnPath(t: number, points: THREE.Vector3[]): THREE.Vector3 {
    if (points.length < 2) return points[0]?.clone() || new THREE.Vector3()

    const segmentCount = points.length - 1
    const segmentT = t * segmentCount
    const segmentIndex = Math.min(Math.floor(segmentT), segmentCount - 1)
    const localT = segmentT - segmentIndex

    const p0 = points[segmentIndex]
    const p1 = points[segmentIndex + 1]

    return new THREE.Vector3(
      p0.x + (p1.x - p0.x) * localT,
      p0.y + (p1.y - p0.y) * localT,
      p0.z + (p1.z - p0.z) * localT
    )
  }

  dispose() {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
}
