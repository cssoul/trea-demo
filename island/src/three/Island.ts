import * as THREE from 'three'

export class Island {
  group: THREE.Group

  constructor() {
    this.group = new THREE.Group()
    this.createSeabed()
    this.createBeachAndLand()
    this.createDenseForest()
    this.createBeachVillas()
    this.createOverwaterVillas()
    this.createDock()
  }

  private createSeabed() {
    const geo = new THREE.CircleGeometry(200, 128)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a6b7a,
      roughness: 0.9,
      metalness: 0.1,
    })
    const seabed = new THREE.Mesh(geo, mat)
    seabed.position.y = -3
    this.group.add(seabed)

    const sandGeo = new THREE.CircleGeometry(55, 64)
    sandGeo.rotateX(-Math.PI / 2)
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xc8e8e0,
      roughness: 0.9,
    })
    const sand = new THREE.Mesh(sandGeo, sandMat)
    sand.position.y = -2.8
    this.group.add(sand)
  }

  private createBeachAndLand() {
    const beachShape = new THREE.Shape()
    const beachPoints: THREE.Vector2[] = []
    const segments = 96
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2
      const rx = 42
      const rz = 30
      const noise =
        Math.sin(a * 3) * 1.5 +
        Math.sin(a * 7) * 0.8 +
        Math.cos(a * 5) * 1.2
      const x = Math.cos(a) * (rx + noise)
      const y = Math.sin(a) * (rz + noise * 0.7)
      beachPoints.push(new THREE.Vector2(x, y))
    }
    beachShape.setFromPoints(beachPoints)

    const beachGeo = new THREE.ShapeGeometry(beachShape, 64)
    beachGeo.rotateX(-Math.PI / 2)
    beachGeo.translate(0, 0.3, 0)
    const beachMat = new THREE.MeshStandardMaterial({
      color: 0xfdf6e3,
      roughness: 0.85,
    })
    const beach = new THREE.Mesh(beachGeo, beachMat)
    beach.receiveShadow = true
    this.group.add(beach)

    const landShape = new THREE.Shape()
    const landPoints: THREE.Vector2[] = []
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2
      const rx = 36
      const rz = 25
      const noise =
        Math.sin(a * 4 + 1) * 1.0 + Math.cos(a * 6) * 0.6
      const x = Math.cos(a) * (rx + noise)
      const y = Math.sin(a) * (rz + noise * 0.6)
      landPoints.push(new THREE.Vector2(x, y))
    }
    landShape.setFromPoints(landPoints)

    const landGeo = new THREE.ShapeGeometry(landShape, 64)
    landGeo.rotateX(-Math.PI / 2)
    landGeo.translate(0, 0.8, 0)
    const landMat = new THREE.MeshStandardMaterial({
      color: 0x3d8b3d,
      roughness: 0.95,
    })
    const land = new THREE.Mesh(landGeo, landMat)
    land.receiveShadow = true
    this.group.add(land)
  }

  private createDenseForest() {
    const rng = this.mulberry32(12345)

    const palmCount = 120
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 5, 7)
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x9b7b4a,
      roughness: 0.9,
    })

    const frondMats = [
      new THREE.MeshStandardMaterial({ color: 0x2d8a3e, roughness: 0.75, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x3ba651, roughness: 0.75, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x4bbf63, roughness: 0.75, side: THREE.DoubleSide }),
    ]

    const frondGeo = this.createPalmFrondGeometry()

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, palmCount)
    const frondMeshes = frondMats.map((mat) => {
      return new THREE.InstancedMesh(frondGeo, mat, palmCount * 7)
    })

    const dummy = new THREE.Object3D()
    let frondIndex = [0, 0, 0]

    for (let i = 0; i < palmCount; i++) {
      let x: number, z: number
      let attempts = 0
      do {
        const a = rng() * Math.PI * 2
        const r = Math.sqrt(rng()) * 0.85
        x = Math.cos(a) * 38 * r
        z = Math.sin(a) * 26 * r
        attempts++
      } while (Math.sqrt((x / 38) ** 2 + (z / 26) ** 2) > 0.85 && attempts < 20)

      const height = 3.5 + rng() * 2
      const lean = (rng() - 0.5) * 0.2
      const rotation = rng() * Math.PI * 2

      dummy.position.set(x, 0.8 + height / 2, z)
      dummy.rotation.set(lean, rotation, lean * 0.5)
      dummy.scale.set(1, height / 5, 1)
      dummy.updateMatrix()
      trunkMesh.setMatrixAt(i, dummy.matrix)

      const frondsPerTree = 7
      for (let f = 0; f < frondsPerTree; f++) {
        const angle = (f / frondsPerTree) * Math.PI * 2 + rng() * 0.3
        const frondLen = 2.8 + rng() * 1.5
        const matIndex = Math.floor(rng() * 3)
        const fi = frondIndex[matIndex]++

        dummy.position.set(
          x,
          0.8 + height + 0.3,
          z
        )
        dummy.rotation.set(
          0.9 + rng() * 0.3,
          -angle,
          (rng() - 0.5) * 0.2
        )
        dummy.scale.set(1 + rng() * 0.3, frondLen / 3.5, 1)
        dummy.updateMatrix()
        frondMeshes[matIndex].setMatrixAt(fi, dummy.matrix)
      }
    }

    trunkMesh.instanceMatrix.needsUpdate = true
    trunkMesh.castShadow = true
    this.group.add(trunkMesh)

    for (const mesh of frondMeshes) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = true
      this.group.add(mesh)
    }

    const bushCount = 80
    const bushGeo = new THREE.SphereGeometry(1, 6, 5)
    const bushMat = new THREE.MeshStandardMaterial({
      color: 0x2d7a2d,
      roughness: 0.9,
    })
    const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, bushCount)
    for (let i = 0; i < bushCount; i++) {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * 0.9
      const x = Math.cos(a) * 38 * r
      const z = Math.sin(a) * 26 * r
      const s = 0.6 + rng() * 1.0
      dummy.position.set(x, 0.8 + s * 0.4, z)
      dummy.rotation.set(0, rng() * Math.PI * 2, 0)
      dummy.scale.set(s * 1.3, s * 0.7, s)
      dummy.updateMatrix()
      bushMesh.setMatrixAt(i, dummy.matrix)
    }
    bushMesh.instanceMatrix.needsUpdate = true
    bushMesh.castShadow = true
    this.group.add(bushMesh)
  }

  private createBeachVillas() {
    const positions = [
      { x: -25, z: 18, rot: -0.3 },
      { x: -10, z: 22, rot: 0.1 },
      { x: 8, z: 21, rot: -0.1 },
      { x: 22, z: 19, rot: 0.3 },
      { x: 30, z: 8, rot: 0.8 },
      { x: -30, z: 5, rot: -0.8 },
    ]

    for (const pos of positions) {
      const villa = this.createBeachVilla()
      villa.position.set(pos.x, 0.35, pos.z)
      villa.rotation.y = pos.rot
      this.group.add(villa)
    }
  }

  private createBeachVilla(): THREE.Group {
    const villa = new THREE.Group()

    const wallGeo = new THREE.BoxGeometry(5, 2.2, 4)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xf5f0e0,
      roughness: 0.7,
    })
    const wall = new THREE.Mesh(wallGeo, wallMat)
    wall.position.y = 1.6
    wall.castShadow = true
    villa.add(wall)

    const roofGeo = new THREE.ConeGeometry(4.2, 2, 4)
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
    })
    const roof = new THREE.Mesh(roofGeo, roofMat)
    roof.position.y = 3.7
    roof.rotation.y = Math.PI / 4
    roof.castShadow = true
    villa.add(roof)

    const windowGeo = new THREE.PlaneGeometry(1.2, 1)
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a4a,
      roughness: 0.3,
      metalness: 0.5,
    })
    const win1 = new THREE.Mesh(windowGeo, windowMat)
    win1.position.set(0, 1.6, 2.01)
    villa.add(win1)

    return villa
  }

  private createOverwaterVillas() {
    const walkwayMat = new THREE.MeshStandardMaterial({
      color: 0x9b8a7a,
      roughness: 0.8,
    })

    const centralWalkway = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.3, 80),
      walkwayMat
    )
    centralWalkway.position.set(0, 0.4, 43)
    centralWalkway.castShadow = true
    centralWalkway.receiveShadow = true
    this.group.add(centralWalkway)

    this.createEyeRing(walkwayMat, 0, 30, 24, 18)
    this.createEyeRing(walkwayMat, 0, 60, 20, 15)

    this.addCrossWalkways(walkwayMat)

    const villaPositions = this.generateVillaPositions()
    for (const vp of villaPositions) {
      const villa = this.createOverwaterVilla()
      villa.position.set(vp.x, 0.2, vp.z)
      villa.rotation.y = vp.rot
      this.group.add(villa)
    }

    const mainVilla = this.createMainVilla()
    mainVilla.position.set(0, 0.2, 82)
    this.group.add(mainVilla)
  }

  private createEyeRing(
    walkwayMat: THREE.MeshStandardMaterial,
    cx: number,
    cz: number,
    rx: number,
    rz: number
  ) {
    const count = 48
    const points: THREE.Vector3[] = []
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      points.push(new THREE.Vector3(cx + Math.cos(a) * rx, 0, cz + Math.sin(a) * rz))
    }

    for (let i = 0; i < count; i++) {
      const p1 = points[i]
      const p2 = points[(i + 1) % count]
      const dx = p2.x - p1.x
      const dz = p2.z - p1.z
      const len = Math.sqrt(dx * dx + dz * dz)
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(len + 0.4, 0.3, 2.2),
        walkwayMat
      )
      seg.position.set((p1.x + p2.x) / 2, 0.4, (p1.z + p2.z) / 2)
      seg.rotation.y = Math.atan2(dx, dz)
      seg.castShadow = true
      seg.receiveShadow = true
      this.group.add(seg)
    }
  }

  private addCrossWalkways(walkwayMat: THREE.MeshStandardMaterial) {
    const crosswalks = [
      { z: 18, w: 32 },
      { z: 30, w: 36 },
      { z: 42, w: 30 },
      { z: 52, w: 28 },
      { z: 60, w: 26 },
      { z: 70, w: 22 },
    ]
    for (const cw of crosswalks) {
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(cw.w, 0.3, 2.2),
        walkwayMat
      )
      cross.position.set(0, 0.4, cw.z)
      cross.castShadow = true
      this.group.add(cross)
    }
  }

  private generateVillaPositions(): { x: number; z: number; rot: number }[] {
    const positions: { x: number; z: number; rot: number }[] = []

    const addVillasOnRing = (
      cx: number,
      cz: number,
      rx: number,
      rz: number,
      countPerSide: number
    ) => {
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < countPerSide; i++) {
          const t = (i + 0.5) / countPerSide
          const a = side < 0
            ? Math.PI * 0.15 + t * Math.PI * 0.7
            : Math.PI * 1.15 + t * Math.PI * 0.7

          const x = cx + Math.cos(a) * (rx + 4.5)
          const z = cz + Math.sin(a) * (rz + 3.5)
          const rot = Math.PI - a

          positions.push({ x, z, rot })
        }
      }
    }

    addVillasOnRing(0, 30, 24, 18, 7)
    addVillasOnRing(0, 60, 20, 15, 6)

    return positions
  }

  private createOverwaterVilla(): THREE.Group {
    const villa = new THREE.Group()

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      roughness: 0.8,
    })
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.3, 5.5),
      woodMat
    )
    platform.position.y = 1.0
    platform.castShadow = true
    platform.receiveShadow = true
    villa.add(platform)

    for (let i = 0; i < 4; i++) {
      const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 4, 6)
      const legMat = new THREE.MeshStandardMaterial({ color: 0x4a3520 })
      const leg = new THREE.Mesh(legGeo, legMat)
      const dx = i < 2 ? 1.8 : -1.8
      const dz = i % 2 === 0 ? 2.2 : -2.2
      leg.position.set(dx, -0.5, dz)
      leg.castShadow = true
      villa.add(leg)
    }

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xfdfcf7,
      roughness: 0.55,
    })
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 2.0, 4),
      wallMat
    )
    wall.position.y = 2.15
    wall.castShadow = true
    villa.add(wall)

    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x6b5a45,
      roughness: 0.95,
    })
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3.8, 2.0, 4),
      roofMat
    )
    roof.position.y = 4.15
    roof.rotation.y = Math.PI / 4
    roof.castShadow = true
    villa.add(roof)

    const roofTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.6, 4),
      new THREE.MeshStandardMaterial({ color: 0x4a3a25 })
    )
    roofTip.position.y = 5.45
    roofTip.rotation.y = Math.PI / 4
    villa.add(roofTip)

    const winMat = new THREE.MeshStandardMaterial({
      color: 0x1e3d5c,
      roughness: 0.15,
      metalness: 0.5,
    })
    for (let side = -1; side <= 1; side += 2) {
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.0),
        winMat
      )
      win.position.set(side * 1.76, 2.2, 0)
      win.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2
      villa.add(win)
    }
    const frontWin = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.2),
      winMat
    )
    frontWin.position.set(0, 2.2, 2.01)
    villa.add(frontWin)

    const pool = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.1, 1.2),
      new THREE.MeshStandardMaterial({
        color: 0x0099cc,
        roughness: 0.1,
        metalness: 0.3,
        transparent: true,
        opacity: 0.85,
      })
    )
    pool.position.set(0, 1.18, -1.8)
    villa.add(pool)

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.2, 2),
      woodMat
    )
    deck.position.set(0, 1.05, -3)
    deck.castShadow = true
    deck.receiveShadow = true
    villa.add(deck)

    return villa
  }

  private createMainVilla(): THREE.Group {
    const villa = new THREE.Group()

    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xfdfcf7,
      roughness: 0.5,
    })
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0xe8e4dc,
      roughness: 0.7,
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1e3d5c,
      roughness: 0.1,
      metalness: 0.5,
    })

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.6, 12),
      concreteMat
    )
    base.position.y = 1.8
    base.castShadow = true
    base.receiveShadow = true
    villa.add(base)

    for (let i = 0; i < 10; i++) {
      const legGeo = new THREE.CylinderGeometry(0.18, 0.18, 5, 6)
      const legMat = new THREE.MeshStandardMaterial({ color: 0x888 })
      const leg = new THREE.Mesh(legGeo, legMat)
      const angle = (i / 10) * Math.PI * 2
      leg.position.set(Math.cos(angle) * 6.5, -0.3, Math.sin(angle) * 5)
      villa.add(leg)
    }

    const lower = new THREE.Mesh(
      new THREE.BoxGeometry(13, 3.5, 9),
      whiteMat
    )
    lower.position.y = 4.0
    lower.castShadow = true
    villa.add(lower)

    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(10, 3, 7),
      whiteMat
    )
    upper.position.set(0, 7.2, -0.3)
    upper.castShadow = true
    villa.add(upper)

    const roofOverhang = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.4, 9),
      concreteMat
    )
    roofOverhang.position.set(0, 9.0, -0.3)
    roofOverhang.castShadow = true
    villa.add(roofOverhang)

    const roofTop = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 0.3, 7.5),
      concreteMat
    )
    roofTop.position.set(0, 9.35, -0.3)
    villa.add(roofTop)

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xc4b8a0, roughness: 0.8 })
    )
    deck.position.set(0, 1.6, 8.5)
    deck.castShadow = true
    deck.receiveShadow = true
    villa.add(deck)

    const pool = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.15, 4),
      new THREE.MeshStandardMaterial({
        color: 0x0099cc,
        roughness: 0.05,
        metalness: 0.4,
        transparent: true,
        opacity: 0.9,
      })
    )
    pool.position.set(0, 1.85, 8.5)
    villa.add(pool)

    const poolEdge = new THREE.Mesh(
      new THREE.BoxGeometry(7.6, 0.25, 4.6),
      new THREE.MeshStandardMaterial({ color: 0xd4cfc4, roughness: 0.6 })
    )
    poolEdge.position.set(0, 1.65, 8.5)
    villa.add(poolEdge)

    for (let i = -2; i <= 2; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.0), glassMat)
      win.position.set(i * 2.3, 4.2, 4.51)
      villa.add(win)
    }
    for (let i = -2; i <= 2; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.0), glassMat)
      win.position.set(i * 2.3, 4.2, -4.51)
      win.rotation.y = Math.PI
      villa.add(win)
    }

    for (let i = -1; i <= 1; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.6), glassMat)
      win.position.set(i * 2.8, 7.4, 3.21)
      villa.add(win)
    }

    const balcony = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.25, 1.5),
      concreteMat
    )
    balcony.position.set(0, 5.8, 4.2)
    balcony.castShadow = true
    villa.add(balcony)

    const railing = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.6, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x333, roughness: 0.4, metalness: 0.6 })
    )
    railing.position.set(0, 6.2, 4.9)
    villa.add(railing)

    const loungeMat = new THREE.MeshStandardMaterial({ color: 0xf0ebe0, roughness: 0.8 })
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5a3e1b, roughness: 0.7 })
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 2; i++) {
        const lounge = new THREE.Group()
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.15, 2.8),
          frameMat
        )
        frame.position.y = 0.08
        lounge.add(frame)
        const cushion = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 0.12, 2.5),
          loungeMat
        )
        cushion.position.set(0, 0.22, -0.1)
        lounge.add(cushion)
        const backrest = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 0.12, 0.9),
          loungeMat
        )
        backrest.position.set(0, 0.55, -1.0)
        backrest.rotation.x = -0.4
        lounge.add(backrest)
        lounge.position.set(side * 4.8, 1.85, 9.5 + i * 3)
        lounge.rotation.y = side * 0.15
        villa.add(lounge)
      }
    }

    return villa
  }

  private createDock() {
    const dock = new THREE.Group()
    const dockMat = new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      roughness: 0.8,
    })

    const mainDock = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 10),
      dockMat
    )
    mainDock.position.set(-40, 0.4, -8)
    mainDock.rotation.y = 0.8
    mainDock.castShadow = true
    dock.add(mainDock)

    const endDock = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.2, 3),
      dockMat
    )
    endDock.position.set(-46, 0.4, -14)
    endDock.rotation.y = 0.8
    endDock.castShadow = true
    dock.add(endDock)

    for (let i = 0; i < 6; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x5a3e1b })
      )
      post.position.set(-40 + Math.cos(0.8 + Math.PI/2) * i * 1.8, -0.1, -8 + Math.sin(0.8 + Math.PI/2) * i * 1.8)
      dock.add(post)
    }

    const boat = this.createBoat()
    boat.position.set(-50, 0.1, -18)
    boat.rotation.y = 0.8
    dock.add(boat)

    this.group.add(dock)
  }

  private createBoat(): THREE.Group {
    const boat = new THREE.Group()
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x6b3a1f,
      roughness: 0.7,
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xd4a843,
      roughness: 0.5,
    })

    const hullGeo = new THREE.BoxGeometry(2.5, 1.2, 7)
    hullGeo.scale(1, 0.7, 1)
    const hull = new THREE.Mesh(hullGeo, hullMat)
    hull.position.y = 0.3
    hull.castShadow = true
    boat.add(hull)

    const bowGeo = new THREE.ConeGeometry(1.25, 2, 4)
    bowGeo.rotateX(Math.PI / 2)
    bowGeo.scale(1, 0.7, 1)
    const bow = new THREE.Mesh(bowGeo, hullMat)
    bow.position.set(0, 0.3, -4.2)
    bow.castShadow = true
    boat.add(bow)

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.15, 6),
      trimMat
    )
    deck.position.y = 0.75
    boat.add(deck)

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.08, 3.5),
      new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9 })
    )
    canopy.position.set(0, 2.2, 0.5)
    canopy.castShadow = true
    boat.add(canopy)

    for (const xPos of [-0.9, 0.9]) {
      for (const zPos of [-1, 2]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 1.5, 5),
          new THREE.MeshStandardMaterial({ color: 0x4a2a10 })
        )
        pole.position.set(xPos, 1.5, zPos)
        boat.add(pole)
      }
    }

    return boat
  }

  private createPalmFrondGeometry(): THREE.BufferGeometry {
    const segments = 10
    const length = 3.5
    const maxWidth = 0.7
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const y = t * length
      const taper = Math.sin(t * Math.PI) * (1 - t * 0.3)
      const width = maxWidth * taper
      const droop = -t * t * 0.8
      const midribCurve = Math.sin(t * Math.PI * 0.5) * 0.15

      positions.push(-width, y, droop + midribCurve)
      positions.push(width, y, droop - midribCurve)
      normals.push(0, 0, 1, 0, 0, 1)
      uvs.push(0, t, 1, t)
    }

    for (let i = 0; i < segments; i++) {
      const a = i * 2
      indices.push(a, a + 1, a + 2)
      indices.push(a + 1, a + 3, a + 2)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }

  private mulberry32(seed: number) {
    return () => {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
}
