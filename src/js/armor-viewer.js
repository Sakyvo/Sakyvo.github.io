class ArmorViewer {
  constructor(container, skinUrl, armorLayer1Url, armorLayer2Url) {
    this.container = container;
    this.skinUrl = skinUrl;
    this.armorLayer1Url = armorLayer1Url;
    this.armorLayer2Url = armorLayer2Url;
    this.init();
  }

  init() {
    const w = this.container.clientWidth || 300;
    const h = this.container.clientHeight || 400;

    this.skinViewer = new skinview3d.SkinViewer({
      canvas: this.container.querySelector('canvas') || this.createCanvas(),
      width: w,
      height: h,
      skin: this.skinUrl
    });

    this.skinViewer.autoRotate = true;
    this.skinViewer.autoRotateSpeed = 1;
    this.skinViewer.zoom = 0.9;

    this.loadArmorTextures();
  }

  createCanvas() {
    const canvas = document.createElement('canvas');
    this.container.appendChild(canvas);
    return canvas;
  }

  loadArmorTextures() {
    const loader = new THREE.TextureLoader();
    Promise.all([
      this.loadTex(loader, this.armorLayer1Url),
      this.loadTex(loader, this.armorLayer2Url)
    ]).then(([armor1, armor2]) => {
      [armor1, armor2].forEach(t => {
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
      });
      this.addArmorLayers(armor1, armor2);
    });
  }

  loadTex(loader, url) {
    return new Promise(r => loader.load(url, r));
  }

  uvMap(geo, x, y, w, h, d, tw, th) {
    const uv = geo.attributes.uv;
    const faces = [
      [x, y+d, d, h],
      [x+w+d, y+d, d, h],
      [x+d, y, w, d],
      [x+d+w, y, w, d],
      [x+d, y+d, w, h],
      [x+d+w+d, y+d, w, h]
    ];
    for (let f = 0; f < 6; f++) {
      const [fx, fy, fw, fh] = faces[f];
      const i = f * 4;
      uv.setXY(i,   (fx+fw)/tw, 1-(fy)/th);
      uv.setXY(i+1, (fx)/tw,    1-(fy)/th);
      uv.setXY(i+2, (fx+fw)/tw, 1-(fy+fh)/th);
      uv.setXY(i+3, (fx)/tw,    1-(fy+fh)/th);
    }
  }

  createArmorPart(w, h, d, uvX, uvY, texture, tw, th, scale = 1.1) {
    const geo = new THREE.BoxGeometry(w * scale, h * scale, d * scale);
    this.uvMap(geo, uvX, uvY, w, h, d, tw, th);
    const mat = new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.1 });
    return new THREE.Mesh(geo, mat);
  }

  addArmorLayers(armor1, armor2) {
    const player = this.skinViewer.playerObject;
    const atw = 64, ath = 32;

    // Helmet (0,0) on layer1
    const helmet = this.createArmorPart(8, 8, 8, 0, 0, armor1, atw, ath, 1.1);
    player.skin.head.add(helmet);

    // Chestplate body (16,16) on layer1
    const chest = this.createArmorPart(8, 12, 4, 16, 16, armor1, atw, ath, 1.1);
    player.skin.body.add(chest);

    // Chestplate right arm (40,16) on layer1
    const rArmArmor = this.createArmorPart(4, 12, 4, 40, 16, armor1, atw, ath, 1.1);
    player.skin.rightArm.add(rArmArmor);

    // Chestplate left arm (40,16) on layer1
    const lArmArmor = this.createArmorPart(4, 12, 4, 40, 16, armor1, atw, ath, 1.1);
    player.skin.leftArm.add(lArmArmor);

    // Leggings right leg (0,0) on layer2
    const rLegArmor = this.createArmorPart(4, 12, 4, 0, 0, armor2, atw, ath, 1.08);
    player.skin.rightLeg.add(rLegArmor);

    // Leggings left leg (0,0) on layer2
    const lLegArmor = this.createArmorPart(4, 12, 4, 0, 0, armor2, atw, ath, 1.08);
    player.skin.leftLeg.add(lLegArmor);

    // Boots right leg (0,16) on layer1
    const rBoot = this.createArmorPart(4, 12, 4, 0, 16, armor1, atw, ath, 1.12);
    player.skin.rightLeg.add(rBoot);

    // Boots left leg (0,16) on layer1
    const lBoot = this.createArmorPart(4, 12, 4, 0, 16, armor1, atw, ath, 1.12);
    player.skin.leftLeg.add(lBoot);
  }
}

window.ArmorViewer = ArmorViewer;
