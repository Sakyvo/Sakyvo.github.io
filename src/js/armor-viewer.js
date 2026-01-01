class ArmorViewer {
  constructor(container, skinUrl, armorLayer1Url, armorLayer2Url) {
    this.container = container;
    this.skinUrl = skinUrl;
    this.armorLayer1Url = armorLayer1Url;
    this.armorLayer2Url = armorLayer2Url;
    this.init();
  }

  async init() {
    const canvas = document.createElement('canvas');
    this.container.appendChild(canvas);

    this.skinViewer = new skinview3d.SkinViewer({
      canvas: canvas,
      width: 200,
      height: 280
    });

    this.skinViewer.zoom = 0.9;
    this.skinViewer.autoRotate = true;
    this.skinViewer.autoRotateSpeed = 0.5;

    // Use walk animation for continuous movement
    this.skinViewer.animation = new skinview3d.WalkingAnimation();
    this.skinViewer.animation.speed = 0.5;

    await this.skinViewer.loadSkin(this.skinUrl);

    // Load armor using skinview3d's built-in cape layer approach
    // We'll add armor as additional layers on the model
    this.addArmorLayers();
  }

  async addArmorLayers() {
    const player = this.skinViewer.playerObject;
    if (!player) return;

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';

    try {
      const [armor1, armor2] = await Promise.all([
        this.loadTexture(loader, this.armorLayer1Url),
        this.loadTexture(loader, this.armorLayer2Url)
      ]);

      if (!armor1 || !armor2) return;

      [armor1, armor2].forEach(t => {
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
      });

      const tw = 64, th = 32;

      // Layer 2: Leggings only (scale 1.04)
      this.addPart(player.skin.rightLeg, 4, 12, 4, 0, 0, armor2, tw, th, 1.04);
      this.addPart(player.skin.leftLeg, 4, 12, 4, 0, 0, armor2, tw, th, 1.04);

      // Layer 1: Helmet, Chestplate, Boots (scale 1.08)
      this.addPart(player.skin.head, 8, 8, 8, 0, 0, armor1, tw, th, 1.08);
      this.addPart(player.skin.body, 8, 12, 4, 16, 16, armor1, tw, th, 1.08);
      this.addPart(player.skin.rightArm, 4, 12, 4, 40, 16, armor1, tw, th, 1.08);
      this.addPart(player.skin.leftArm, 4, 12, 4, 40, 16, armor1, tw, th, 1.08);

      // Boots (scale 1.1 to be outside leggings)
      this.addPart(player.skin.rightLeg, 4, 12, 4, 0, 16, armor1, tw, th, 1.1);
      this.addPart(player.skin.leftLeg, 4, 12, 4, 0, 16, armor1, tw, th, 1.1);

    } catch (e) {
      console.error('Armor load error:', e);
    }
  }

  loadTexture(loader, url) {
    return new Promise(resolve => {
      loader.load(url, resolve, undefined, () => resolve(null));
    });
  }

  addPart(parent, w, h, d, uvX, uvY, texture, tw, th, scale) {
    const geo = new THREE.BoxGeometry(w * scale, h * scale, d * scale);
    this.mapUV(geo, uvX, uvY, w, h, d, tw, th);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    parent.add(mesh);
  }

  mapUV(geo, x, y, w, h, d, tw, th) {
    const uv = geo.attributes.uv;
    // Box faces: right, left, top, bottom, front, back
    const faces = [
      [x, y + d, d, h],           // right
      [x + w + d, y + d, d, h],   // left
      [x + d, y, w, d],           // top
      [x + d + w, y, w, d],       // bottom
      [x + d, y + d, w, h],       // front
      [x + d + w + d, y + d, w, h] // back
    ];
    for (let f = 0; f < 6; f++) {
      const [fx, fy, fw, fh] = faces[f];
      const i = f * 4;
      uv.setXY(i,     (fx + fw) / tw, 1 - fy / th);
      uv.setXY(i + 1, fx / tw,        1 - fy / th);
      uv.setXY(i + 2, (fx + fw) / tw, 1 - (fy + fh) / th);
      uv.setXY(i + 3, fx / tw,        1 - (fy + fh) / th);
    }
  }
}

window.ArmorViewer = ArmorViewer;
