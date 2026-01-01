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
    const h = this.container.clientHeight || 280;

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
        if (t) {
          t.magFilter = THREE.NearestFilter;
          t.minFilter = THREE.NearestFilter;
        }
      });
      this.buildModel(skin, armor1, armor2);
      this.animate();
    });
  }

  loadTex(loader, url) {
    return new Promise(r => loader.load(url, r, undefined, () => r(null)));
  }

  uvMap(geo, x, y, w, h, d, tw, th) {
    const uv = geo.attributes.uv;
    const faces = [
      [x, y + d, d, h],
      [x + w + d, y + d, d, h],
      [x + d, y, w, d],
      [x + d + w, y, w, d],
      [x + d, y + d, w, h],
      [x + d + w + d, y + d, w, h]
    ];
    for (let f = 0; f < 6; f++) {
      const [fx, fy, fw, fh] = faces[f];
      const i = f * 4;
      uv.setXY(i, (fx + fw) / tw, 1 - fy / th);
      uv.setXY(i + 1, fx / tw, 1 - fy / th);
      uv.setXY(i + 2, (fx + fw) / tw, 1 - (fy + fh) / th);
      uv.setXY(i + 3, fx / tw, 1 - (fy + fh) / th);
    }
  }

  createPart(w, h, d, skin, armor, skinUV, armorUV, tw, th, atw, ath, armorScale = 1.1) {
    const group = new THREE.Group();

    const skinGeo = new THREE.BoxGeometry(w, h, d);
    this.uvMap(skinGeo, skinUV[0], skinUV[1], w, h, d, tw, th);
    const skinMat = new THREE.MeshLambertMaterial({ map: skin, transparent: true });
    group.add(new THREE.Mesh(skinGeo, skinMat));

    if (armor && armorUV) {
      const armorGeo = new THREE.BoxGeometry(w * armorScale, h * armorScale, d * armorScale);
      this.uvMap(armorGeo, armorUV[0], armorUV[1], w, h, d, atw, ath);
      const armorMat = new THREE.MeshLambertMaterial({ map: armor, transparent: true, alphaTest: 0.1 });
      group.add(new THREE.Mesh(armorGeo, armorMat));
    }

    return group;
  }

  buildModel(skin, armor1, armor2) {
    const tw = 64, th = 64, atw = 64, ath = 32;

    const head = this.createPart(8, 8, 8, skin, armor1, [0, 0], [0, 0], tw, th, atw, ath);
    head.position.y = 12;
    this.group.add(head);

    const body = this.createPart(8, 12, 4, skin, armor1, [16, 16], [16, 16], tw, th, atw, ath);
    body.position.y = 2;
    this.group.add(body);

    const rArm = this.createPart(4, 12, 4, skin, null, [40, 16], null, tw, th, atw, ath);
    rArm.position.set(-6, 2, 0);
    this.group.add(rArm);

    const lArm = this.createPart(4, 12, 4, skin, null, [32, 48], null, tw, th, atw, ath);
    lArm.position.set(6, 2, 0);
    this.group.add(lArm);

    const rLeg = this.createPart(4, 12, 4, skin, armor2, [0, 16], [0, 16], tw, th, atw, ath);
    rLeg.position.set(-2, -10, 0);
    this.group.add(rLeg);

    const lLeg = this.createPart(4, 12, 4, skin, armor2, [16, 48], [0, 16], tw, th, atw, ath);
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
