// GUI Preview Renderer - renders crosshair and HUD using widgets.png and icons.png
// Supports all texture resolutions (16x, 32x, 64x, 128x, etc.)

class GuiPreview {
  constructor(canvas, texturePath) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.texturePath = texturePath;
    this.widgets = null;
    this.icons = null;
    this.widgetsScale = 1;
    this.iconsScale = 1;
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

  // Draw crosshair with black background removed
  drawCrosshair(dx, dy, size) {
    const srcScale = this.iconsScale;
    const outScale = this.outputScale;
    const srcSize = 15 * srcScale;
    const destSize = size * outScale;

    // Create temp canvas to process crosshair
    const temp = document.createElement('canvas');
    temp.width = destSize;
    temp.height = destSize;
    const tctx = temp.getContext('2d');
    tctx.imageSmoothingEnabled = false;

    // Draw crosshair to temp canvas
    tctx.drawImage(this.icons, 0, 0, srcSize, srcSize, 0, 0, destSize, destSize);

    // Remove black background
    const imageData = tctx.getImageData(0, 0, destSize, destSize);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // If pixel is black or near-black, make it transparent
      if (data[i] < 30 && data[i + 1] < 30 && data[i + 2] < 30) {
        data[i + 3] = 0;
      }
    }
    tctx.putImageData(imageData, 0, 0);

    // Draw processed crosshair to main canvas
    this.ctx.drawImage(temp, dx * outScale, dy * outScale);
  }

  render() {
    if (!this.widgets || !this.icons) return;

    const baseW = 182;
    const baseH = 100;
    const scale = this.outputScale;

    this.canvas.width = baseW * scale;
    this.canvas.height = baseH * scale;
    this.ctx.imageSmoothingEnabled = false;

    // Light blue background
    this.ctx.fillStyle = '#87CEEB';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // === Crosshair in center (with black removed) ===
    const crosshairSize = 15;
    const crosshairX = (baseW - crosshairSize) / 2;
    const crosshairY = (baseH - 40 - crosshairSize) / 2;
    this.drawCrosshair(crosshairX, crosshairY, crosshairSize);

    // === HUD at bottom ===
    const hotbarX = 0;
    const hotbarY = baseH - 22;

    // XP bar background
    this.drawWidgets(0, 64, 182, 5, hotbarX, hotbarY - 7);
    // XP bar fill (80%)
    this.drawWidgets(0, 69, 145, 5, hotbarX, hotbarY - 7);

    // Hotbar background
    this.drawWidgets(0, 0, 182, 22, hotbarX, hotbarY);
    // Selection highlight
    this.drawWidgets(0, 22, 24, 24, hotbarX - 1, hotbarY - 1);

    // Hearts
    const heartsY = hotbarY - 7 - 10;
    for (let i = 0; i < 10; i++) {
      const x = hotbarX + 1 + i * 8;
      this.drawIcons(16, 0, 9, 9, x, heartsY);
      this.drawIcons(52, 0, 9, 9, x, heartsY);
    }

    // Hunger
    for (let i = 0; i < 10; i++) {
      const x = hotbarX + 182 - 9 - 1 - i * 8;
      this.drawIcons(16, 27, 9, 9, x, heartsY);
      this.drawIcons(52, 27, 9, 9, x, heartsY);
    }

    // Armor
    const armorY = heartsY - 10;
    for (let i = 0; i < 10; i++) {
      const x = hotbarX + 1 + i * 8;
      this.drawIcons(16, 9, 9, 9, x, armorY);
      this.drawIcons(34, 9, 9, 9, x, armorY);
    }
  }
}

window.GuiPreview = GuiPreview;
