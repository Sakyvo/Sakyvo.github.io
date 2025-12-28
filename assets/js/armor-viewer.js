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

  uvMap(geo, x, y, w, h, tw, th) {
    const uv = geo.attributes.uv;
    const coords = [
      [x+w, y+h], [x, y+h], [x+w, y], [x, y], // front
      [x+w*2, y+h], [x+w, y+h], [x+w*2, y], [x+w, y], // back
      [x, y], [x, y+h], [x+w, y], [x+w, y+h], // top
      [x+w, y], [x+w, y+h], [x+w*2, y], [x+w*2, y+h], // bottom
      [x, y+h], [x-w, y+h], [x, y], [x-w, y], // right
      [x+w*2, y+h], [x+w, y+h], [x+w*2, y], [x+w, y] // left
    ];
    for (let i = 0; i < 24; i++) {
      uv.setXY(i, coords[i][0]/tw, 1 - coords[i][1]/th);
    }
  }

  createPart(w, h, d, skin, armor, skinUV, armorUV, tw, th, atw, ath, armorScale = 1.1) {
    const group = new THREE.Group();

    // Skin layer
    const skinGeo = new THREE.BoxGeometry(w, h, d);
    this.uvMap(skinGeo, skinUV[0], skinUV[1], skinUV[2], skinUV[3], tw, th);
    const skinMat = new THREE.MeshLambertMaterial({ map: skin, transparent: true });
    group.add(new THREE.Mesh(skinGeo, skinMat));

    // Armor layer
    if (armor && armorUV) {
      const armorGeo = new THREE.BoxGeometry(w * armorScale, h * armorScale, d * armorScale);
      this.uvMap(armorGeo, armorUV[0], armorUV[1], armorUV[2], armorUV[3], atw, ath);
      const armorMat = new THREE.MeshLambertMaterial({ map: armor, transparent: true });
      group.add(new THREE.Mesh(armorGeo, armorMat));
    }

    return group;
  }

  buildModel(skin, armor1, armor2) {
    // Steve skin: 64x64, Armor: 64x32
    const tw = 64, th = 64, atw = 64, ath = 32;

    // Head (8x8x8) - skin at (8,8), armor at (8,8) in layer1
    const head = this.createPart(8, 8, 8, skin, armor1, [8, 8, 8, 8], [8, 8, 8, 8], tw, th, atw, ath);
    head.position.y = 12;
    this.group.add(head);

    // Body (8x12x4) - skin at (20,20), armor at (20,20) in layer1
    const body = this.createPart(8, 12, 4, skin, armor1, [20, 20, 8, 12], [20, 20, 8, 12], tw, th, atw, ath);
    body.position.y = 2;
    this.group.add(body);

    // Right Arm (4x12x4) - skin at (44,20)
    const rArm = this.createPart(4, 12, 4, skin, null, [44, 20, 4, 12], null, tw, th, atw, ath);
    rArm.position.set(-6, 2, 0);
    this.group.add(rArm);

    // Left Arm (4x12x4) - skin at (36,52)
    const lArm = this.createPart(4, 12, 4, skin, null, [36, 52, 4, 12], null, tw, th, atw, ath);
    lArm.position.set(6, 2, 0);
    this.group.add(lArm);

    // Right Leg (4x12x4) - skin at (4,20), armor at (4,20) in layer2
    const rLeg = this.createPart(4, 12, 4, skin, armor2, [4, 20, 4, 12], [4, 20, 4, 12], tw, th, atw, ath);
    rLeg.position.set(-2, -10, 0);
    this.group.add(rLeg);

    // Left Leg (4x12x4) - skin at (20,52), armor at (4,20) in layer2
    const lLeg = this.createPart(4, 12, 4, skin, armor2, [20, 52, 4, 12], [4, 20, 4, 12], tw, th, atw, ath);
    lLeg.position.set(2, -10, 0);
    this.group.add(lLeg);

    this.group.rotation.x = 0.1;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.group.rotation.y += 0.01;
    this.renderer.render(this.scene, this.camera);
  }
}

window.ArmorViewer = ArmorViewer;
