// HUD Preview Renderer - renders Minecraft 1.8.9 style HUD using widgets.png and icons.png
// Coordinates are based on 256x256 texture atlas

class HudPreview {
  constructor(canvas, texturePath) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.texturePath = texturePath;
    this.widgets = null;
    this.icons = null;
    this.scale = 1;
  }

  async load() {
    const [widgets, icons] = await Promise.all([
      this.loadImage(`${this.texturePath}widgets.png`),
      this.loadImage(`${this.texturePath}icons.png`)
    ]);
    this.widgets = widgets;
    this.icons = icons;
    this.scale = this.widgets.width / 256;
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Draw from texture atlas (coords in 256-base)
  draw(img, u, v, w, h, dx, dy, dw, dh) {
    const s = this.scale;
    this.ctx.drawImage(img, u * s, v * s, w * s, h * s, dx, dy, dw || w * 2, dh || h * 2);
  }

  render() {
    if (!this.widgets || !this.icons) return;

    const W = 364, H = 128;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx.imageSmoothingEnabled = false;

    // Background
    this.ctx.fillStyle = '#87CEEB';
    this.ctx.fillRect(0, 0, W, H);

    const hotbarY = H - 44;
    const hotbarX = (W - 364) / 2;

    // Hotbar background (0,0,182,22)
    this.draw(this.widgets, 0, 0, 182, 22, hotbarX, hotbarY, 364, 44);

    // Selection box (0,22,24,24) on first slot
    this.draw(this.widgets, 0, 22, 24, 24, hotbarX - 2, hotbarY - 2, 48, 48);

    // Hearts row (above hotbar left)
    const heartsY = hotbarY - 22;
    for (let i = 0; i < 10; i++) {
      // Heart container (16,0,9,9)
      this.draw(this.icons, 16, 0, 9, 9, hotbarX + i * 16, heartsY, 18, 18);
      // Full heart (52,0,9,9)
      this.draw(this.icons, 52, 0, 9, 9, hotbarX + i * 16, heartsY, 18, 18);
    }

    // Hunger row (above hotbar right)
    for (let i = 0; i < 10; i++) {
      // Hunger container (16,27,9,9)
      this.draw(this.icons, 16, 27, 9, 9, hotbarX + 364 - 18 - i * 16, heartsY, 18, 18);
      // Full hunger (52,27,9,9)
      this.draw(this.icons, 52, 27, 9, 9, hotbarX + 364 - 18 - i * 16, heartsY, 18, 18);
    }

    // Armor row (above hearts)
    const armorY = heartsY - 20;
    for (let i = 0; i < 10; i++) {
      // Full armor (34,9,9,9)
      this.draw(this.icons, 34, 9, 9, 9, hotbarX + i * 16, armorY, 18, 18);
    }

    // XP bar (0,64,182,5)
    this.draw(this.widgets, 0, 64, 182, 5, hotbarX, hotbarY - 6, 364, 10);
    // XP fill (0,69,182,5) - 80% filled
    this.draw(this.widgets, 0, 69, 145, 5, hotbarX, hotbarY - 6, 290, 10);
  }
}

window.HudPreview = HudPreview;
