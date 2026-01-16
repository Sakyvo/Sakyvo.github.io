// Inventory Preview Renderer - renders Minecraft 1.8.9 style inventory using inventory.png
// inventory.png uses (0,0,176,166) in 256-base coordinates

class InventoryPreview {
  constructor(canvas, texturePath) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.texturePath = texturePath;
    this.inventory = null;
    this.scale = 1;
  }

  async load() {
    this.inventory = await this.loadImage(`${this.texturePath}inventory.png`);
    this.scale = this.inventory.width / 256;
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  render() {
    if (!this.inventory) return;

    const s = this.scale;
    // Original inventory is 176x166 in 256-base
    const W = 176 * 2, H = 166 * 2;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx.imageSmoothingEnabled = false;

    // Draw inventory background (0,0,176,166)
    this.ctx.drawImage(this.inventory, 0, 0, 176 * s, 166 * s, 0, 0, W, H);
  }
}

window.InventoryPreview = InventoryPreview;
