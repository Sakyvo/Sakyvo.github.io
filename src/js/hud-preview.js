// HUD Preview Renderer - renders Minecraft 1.8.9 style HUD using widgets.png and icons.png
// Supports all texture resolutions (16x, 32x, 64x, 128x, etc.)

class HudPreview {
  constructor(canvas, texturePath) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.texturePath = texturePath;
    this.widgets = null;
    this.icons = null;
    // Scale factor: how many pixels per 1 base pixel (256 = 1x, 512 = 2x, etc.)
    this.widgetsScale = 1;
    this.iconsScale = 1;
    // Output scale for high-DPI display
    this.outputScale = 4;
  }

  async load() {
    const [widgets, icons] = await Promise.all([
      this.loadImage(`${this.texturePath}widgets.png`),
      this.loadImage(`${this.texturePath}icons.png`)
    ]);
    this.widgets = widgets;
    this.icons = icons;
    this.widgetsScale = this.widgets.width / 256;
    this.iconsScale = this.icons.width / 256;
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Draw from widgets.png texture atlas
  // u,v,w,h: source coordinates in base units (256x256 space)
  // dx,dy: destination coordinates in base units
  // dw,dh: destination size in base units (defaults to source size)
  drawWidgets(u, v, w, h, dx, dy, dw, dh) {
    const srcScale = this.widgetsScale;
    const outScale = this.outputScale;
    dw = dw ?? w;
    dh = dh ?? h;
    this.ctx.drawImage(
      this.widgets,
      u * srcScale, v * srcScale, w * srcScale, h * srcScale,
      dx * outScale, dy * outScale, dw * outScale, dh * outScale
    );
  }

  // Draw from icons.png texture atlas
  drawIcons(u, v, w, h, dx, dy, dw, dh) {
    const srcScale = this.iconsScale;
    const outScale = this.outputScale;
    dw = dw ?? w;
    dh = dh ?? h;
    this.ctx.drawImage(
      this.icons,
      u * srcScale, v * srcScale, w * srcScale, h * srcScale,
      dx * outScale, dy * outScale, dw * outScale, dh * outScale
    );
  }

  render() {
    if (!this.widgets || !this.icons) return;

    // Base dimensions (in MC GUI scale units)
    const baseW = 182;  // Hotbar width
    const baseH = 62;   // Total height needed
    const scale = this.outputScale;

    this.canvas.width = baseW * scale;
    this.canvas.height = baseH * scale;
    this.ctx.imageSmoothingEnabled = false;

    // Background - sky blue
    this.ctx.fillStyle = '#87CEEB';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Layout (all in base units, 0,0 is top-left)
    const hotbarX = 0;
    const hotbarY = baseH - 22;  // Hotbar at bottom

    // 1. Draw XP bar background (0,64 in widgets.png, 182x5)
    this.drawWidgets(0, 64, 182, 5, hotbarX, hotbarY - 7);

    // 2. Draw XP bar fill (0,69 in widgets.png) - 80% filled
    this.drawWidgets(0, 69, 145, 5, hotbarX, hotbarY - 7);

    // 3. Draw hotbar background (0,0 in widgets.png, 182x22)
    this.drawWidgets(0, 0, 182, 22, hotbarX, hotbarY);

    // 4. Draw selection highlight (0,22 in widgets.png, 24x24)
    this.drawWidgets(0, 22, 24, 24, hotbarX - 1, hotbarY - 1);

    // 5. Draw hearts (above XP bar, left side)
    const heartsY = hotbarY - 7 - 10;  // Above XP bar
    for (let i = 0; i < 10; i++) {
      const x = hotbarX + 1 + i * 8;
      // Heart container background (16,0 in icons.png, 9x9)
      this.drawIcons(16, 0, 9, 9, x, heartsY);
      // Full heart (52,0 in icons.png, 9x9)
      this.drawIcons(52, 0, 9, 9, x, heartsY);
    }

    // 6. Draw hunger (above XP bar, right side)
    for (let i = 0; i < 10; i++) {
      const x = hotbarX + 182 - 9 - 1 - i * 8;
      // Hunger container background (16,27 in icons.png, 9x9)
      this.drawIcons(16, 27, 9, 9, x, heartsY);
      // Full hunger (52,27 in icons.png, 9x9)
      this.drawIcons(52, 27, 9, 9, x, heartsY);
    }

    // 7. Draw armor (above hearts)
    const armorY = heartsY - 10;
    for (let i = 0; i < 10; i++) {
      const x = hotbarX + 1 + i * 8;
      // Armor background (16,9 in icons.png, 9x9)
      this.drawIcons(16, 9, 9, 9, x, armorY);
      // Full armor (34,9 in icons.png, 9x9)
      this.drawIcons(34, 9, 9, 9, x, armorY);
    }
  }
}

window.HudPreview = HudPreview;
