class ArmorViewer {
  constructor(container, skinUrl, armorLayer1Url, armorLayer2Url) {
    this.container = container;
    this.skinUrl = skinUrl;
    this.armorLayer1Url = armorLayer1Url;
    this.armorLayer2Url = armorLayer2Url;
    this.init();
  }

  init() {
    const w = this.container.clientWidth || 200;
    const h = this.container.clientHeight || 200;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    this.camera.position.set(0, 0, 40);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    this.scene.add(dir);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.loadTextures();
  }

  loadTextures() {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';

    Promise.all([
      this.loadTex(loader, this.skinUrl),
      this.loadTex(loader, this.armorLayer1Url),
      this.loadTex(loader, this.armorLayer2Url)
    ]).then(([skin, armor1, armor2]) => {
      [skin, armor1, armor2].forEach(t => {
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
      });
      this.buildModel(skin, armor1, armor2);
      this.animate();
    });
  }

  loadTex(loader, url) {
    return new Promise(r => loader.load(url, r));
  }

  uvMap(geo, x, y, w, h, d, tw, th) {
    const uv = geo.attributes.uv;
    // Minecraft UV layout: top/bottom above, then right/front/left/back in a row
    // BoxGeometry face order: +X(right), -X(left), +Y(top), -Y(bottom), +Z(front), -Z(back)
    const faces = [
      [x, y+d, d, h],           // right (+X)
      [x+w+d, y+d, d, h],       // left (-X)
      [x+d, y, w, d],           // top (+Y)
      [x+d+w, y, w, d],         // bottom (-Y)
      [x+d, y+d, w, h],         // front (+Z)
      [x+d+w+d, y+d, w, h]      // back (-Z)
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

  createPart(w, h, d, skin, armor, skinUV, armorUV, tw, th, atw, ath, armorScale = 1.1) {
    const group = new THREE.Group();

    // Skin layer
    const skinGeo = new THREE.BoxGeometry(w, h, d);
    this.uvMap(skinGeo, skinUV[0], skinUV[1], w, h, d, tw, th);
    const skinMat = new THREE.MeshLambertMaterial({ map: skin, transparent: true });
    group.add(new THREE.Mesh(skinGeo, skinMat));

    // Armor layer
    if (armor && armorUV) {
      const armorGeo = new THREE.BoxGeometry(w * armorScale, h * armorScale, d * armorScale);
      this.uvMap(armorGeo, armorUV[0], armorUV[1], w, h, d, atw, ath);
      const armorMat = new THREE.MeshLambertMaterial({ map: armor, transparent: true });
      group.add(new THREE.Mesh(armorGeo, armorMat));
    }

    return group;
  }

  buildModel(skin, armor1, armor2) {
    // Steve skin: 64x64, Armor: 64x32
    const tw = 64, th = 64, atw = 64, ath = 32;

    // Head (8x8x8) - skin UV at (0,0), armor UV at (0,0)
    const head = this.createPart(8, 8, 8, skin, armor1, [0, 0], [0, 0], tw, th, atw, ath);
    head.position.y = 12;
    this.group.add(head);

    // Body (8x12x4) - skin UV at (16,16), armor UV at (16,16)
    const body = this.createPart(8, 12, 4, skin, armor1, [16, 16], [16, 16], tw, th, atw, ath);
    body.position.y = 2;
    this.group.add(body);

    // Right Arm (4x12x4) - skin UV at (40,16), armor sleeve at (40,16)
    const rArm = this.createPart(4, 12, 4, skin, armor1, [40, 16], [40, 16], tw, th, atw, ath);
    rArm.position.set(-6, 2, 0);
    this.group.add(rArm);

    // Left Arm (4x12x4) - skin UV at (32,48), armor sleeve at (40,16)
    const lArm = this.createPart(4, 12, 4, skin, armor1, [32, 48], [40, 16], tw, th, atw, ath);
    lArm.position.set(6, 2, 0);
    this.group.add(lArm);

    // Right Leg (4x12x4) - skin UV at (0,16), leggings at (0,0)
    const rLeg = this.createPart(4, 12, 4, skin, armor2, [0, 16], [0, 0], tw, th, atw, ath);
    rLeg.position.set(-2, -10, 0);
    this.group.add(rLeg);
    // Right Boot (4x6x4) - armor UV at (0,16) on layer1, only bottom half
    const rBootGeo = new THREE.BoxGeometry(4 * 1.12, 6 * 1.12, 4 * 1.12);
    this.uvMap(rBootGeo, 0, 16, 4, 6, 4, atw, ath);
    const rBootMat = new THREE.MeshLambertMaterial({ map: armor1, transparent: true });
    const rBoot = new THREE.Mesh(rBootGeo, rBootMat);
    rBoot.position.set(-2, -13, 0);
    this.group.add(rBoot);

    // Left Leg (4x12x4) - skin UV at (16,48), leggings at (0,0)
    const lLeg = this.createPart(4, 12, 4, skin, armor2, [16, 48], [0, 0], tw, th, atw, ath);
    lLeg.position.set(2, -10, 0);
    this.group.add(lLeg);
    // Left Boot (4x6x4) - armor UV at (0,16) on layer1, only bottom half
    const lBootGeo = new THREE.BoxGeometry(4 * 1.12, 6 * 1.12, 4 * 1.12);
    this.uvMap(lBootGeo, 0, 16, 4, 6, 4, atw, ath);
    const lBootMat = new THREE.MeshLambertMaterial({ map: armor1, transparent: true });
    const lBoot = new THREE.Mesh(lBootGeo, lBootMat);
    lBoot.position.set(2, -13, 0);
    this.group.add(lBoot);

    this.group.rotation.x = 0.1;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.group.rotation.y += 0.01;
    this.renderer.render(this.scene, this.camera);
  }
}

window.ArmorViewer = ArmorViewer;
