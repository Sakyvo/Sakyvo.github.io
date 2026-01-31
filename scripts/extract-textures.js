const AdmZip = require('adm-zip');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 粒子图集裁剪映射 (16x16 网格, index = x + y * 16)
const PARTICLE_TILES = {
  magicCrit: { index: 65, x: 1, y: 4 },  // 锋利/附魔暴击
  crit: { index: 66, x: 2, y: 4 },       // 普通暴击
};

// 药水Buff图标映射 (从 inventory.png 的 v=198 开始，横向排列，每个 18x18)
// 每行 8 个图标
const BUFF_ICONS = {
  speed: { row: 0, col: 0 },           // 速度 (蓝色脚印)
  fire_resistance: { row: 1, col: 3 }, // 抗火 (橙色火焰)
};

const KEY_TEXTURES = {
  items: [
    ['assets/minecraft/textures/items/diamond_sword.png'],
    ['assets/minecraft/textures/items/ender_pearl.png'],
    { composite: 'potion', bottle: 'assets/minecraft/textures/items/potion_bottle_splash.png', overlay: 'assets/minecraft/textures/items/potion_overlay.png', color: [248, 36, 35] },
    ['assets/minecraft/textures/items/steak.png', 'assets/minecraft/textures/items/beef_cooked.png'],
    ['assets/minecraft/textures/items/iron_sword.png'],
    ['assets/minecraft/textures/items/fishing_rod_uncast.png'],
    ['assets/minecraft/textures/items/apple_golden.png'],
    ['assets/minecraft/textures/items/golden_carrot.png', 'assets/minecraft/textures/items/carrot_golden.png'],
  ],
  blocks: [
    ['assets/minecraft/textures/blocks/grass_side.png'],
    ['assets/minecraft/textures/blocks/stone.png'],
    ['assets/minecraft/textures/blocks/cobblestone.png'],
    ['assets/minecraft/textures/blocks/wool_colored_white.png'],
    ['assets/minecraft/textures/blocks/dirt.png'],
    ['assets/minecraft/textures/blocks/planks_oak.png'],
    ['assets/minecraft/textures/blocks/log_oak.png'],
    ['assets/minecraft/textures/blocks/diamond_ore.png'],
  ],
  armor: [
    ['assets/minecraft/textures/models/armor/diamond_layer_1.png'],
    ['assets/minecraft/textures/models/armor/diamond_layer_2.png'],
  ],
  gui: [
    ['assets/minecraft/textures/gui/icons.png'],
    ['assets/minecraft/textures/gui/widgets.png'],
    ['assets/minecraft/textures/gui/container/inventory.png'],
  ],
  particle: [['assets/minecraft/textures/particle/particles.png']],
};

function cleanMinecraftText(text) {
  if (!text) return '';
  return text.replace(/^!\s*/, '').replace(/§[0-9a-fk-or]/gi, '').trim();
}

function parseDescription(desc) {
  if (!desc) return '';
  if (typeof desc === 'string') return cleanMinecraftText(desc);
  if (Array.isArray(desc)) {
    return desc.map(d => typeof d === 'string' ? cleanMinecraftText(d) : (d.text ? cleanMinecraftText(d.text) : '')).join(' ');
  }
  if (desc.text) return cleanMinecraftText(desc.text);
  return '';
}

function sanitizeName(name) {
  return name.replace(/§[0-9a-fk-or]/gi, '').replace(/[!@#$%^&*()+=\[\]{}|\\:;"'<>,?\/~`]/g, '').trim().replace(/\s+/g, '_');
}

async function extractPack(zipPath) {
  const originalName = path.basename(zipPath, '.zip');
  const packId = sanitizeName(originalName);
  const zip = new AdmZip(zipPath);
  const outputDir = path.join('thumbnails', packId);
  fs.mkdirSync(outputDir, { recursive: true });

  const extracted = { items: [], blocks: [], armor: [], gui: [], particle: [] };
  let description = '';

  // Extract pack.png (use default if not found)
  const packPng = zip.getEntry('pack.png');
  if (packPng) {
    fs.writeFileSync(path.join(outputDir, 'pack.png'), packPng.getData());
  } else {
    fs.copyFileSync('Default_Texture/pack.png', path.join(outputDir, 'pack.png'));
  }

  // Extract pack.mcmeta
  const mcmeta = zip.getEntry('pack.mcmeta');
  if (mcmeta) {
    try {
      const data = JSON.parse(mcmeta.getData().toString('utf-8'));
      description = parseDescription(data.pack?.description);
    } catch (e) {}
  }

  // Extract icon.png (some packs have this)
  const iconPng = zip.getEntry('icon.png');
  if (iconPng) {
    fs.writeFileSync(path.join(outputDir, 'icon.png'), iconPng.getData());
  }

  for (const [category, pathsArray] of Object.entries(KEY_TEXTURES)) {
    for (const alternatives of pathsArray) {
      // Handle composite textures (like potions)
      if (alternatives.composite === 'potion') {
        const filename = 'splash_potion_of_healing.png';
        const bottleEntry = zip.getEntry(alternatives.bottle);
        const overlayEntry = zip.getEntry(alternatives.overlay);

        let bottleBuffer, overlayBuffer;
        if (bottleEntry && overlayEntry) {
          bottleBuffer = bottleEntry.getData();
          overlayBuffer = overlayEntry.getData();
        } else {
          // Fallback to Default_Texture
          const defaultBottle = path.join('Default_Texture', alternatives.bottle);
          const defaultOverlay = path.join('Default_Texture', alternatives.overlay);
          if (fs.existsSync(defaultBottle) && fs.existsSync(defaultOverlay)) {
            bottleBuffer = fs.readFileSync(defaultBottle);
            overlayBuffer = fs.readFileSync(defaultOverlay);
          }
        }

        if (bottleBuffer && overlayBuffer) {
          const [r, g, b] = alternatives.color;

          // 获取 overlay 的原始像素数据
          const overlayRaw = await sharp(overlayBuffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

          const overlayPixels = overlayRaw.data;
          const { width, height } = overlayRaw.info;

          // Multiply 染色：颜色与灰度相乘，保留阴影细节
          for (let i = 0; i < overlayPixels.length; i += 4) {
            if (overlayPixels[i + 3] > 0) {
              overlayPixels[i] = Math.round(overlayPixels[i] * r / 255);
              overlayPixels[i + 1] = Math.round(overlayPixels[i + 1] * g / 255);
              overlayPixels[i + 2] = Math.round(overlayPixels[i + 2] * b / 255);
            }
          }

          // 创建染色后的 overlay
          const tintedOverlay = await sharp(overlayPixels, { raw: { width, height, channels: 4 } })
            .png()
            .toBuffer();

          // 正确的合成顺序：染色液体在底层，瓶子在上层
          await sharp(tintedOverlay)
            .composite([{ input: bottleBuffer, blend: 'over' }])
            .toFile(path.join(outputDir, filename));

          // 同时保存原始 overlay 和 bottle 供前端动态渲染使用
          fs.writeFileSync(path.join(outputDir, 'potion_overlay.png'), overlayBuffer);
          fs.writeFileSync(path.join(outputDir, 'potion_bottle_splash.png'), bottleBuffer);

          extracted[category].push(filename);
        }
        continue;
      }

      let entry = null;
      const filename = path.basename(alternatives[0]);
      for (const alt of alternatives) {
        entry = zip.getEntry(alt);
        if (entry) break;
      }
      if (entry) {
        fs.writeFileSync(path.join(outputDir, filename), entry.getData());
        // Also extract .mcmeta if exists
        const mcmetaEntry = zip.getEntry(alternatives[0] + '.mcmeta');
        if (mcmetaEntry) {
          fs.writeFileSync(path.join(outputDir, filename + '.mcmeta'), mcmetaEntry.getData());
        }
      } else {
        // Fallback to Default_Texture
        for (const alt of alternatives) {
          const defaultPath = path.join('Default_Texture', alt);
          if (fs.existsSync(defaultPath)) {
            fs.copyFileSync(defaultPath, path.join(outputDir, filename));
            break;
          }
        }
      }
      if (fs.existsSync(path.join(outputDir, filename))) {
        extracted[category].push(filename);
      }
    }
  }

  // 从 particles.png 裁剪出单个粒子贴图
  const particlesPath = path.join(outputDir, 'particles.png');
  if (fs.existsSync(particlesPath)) {
    await extractParticleTiles(particlesPath, outputDir);
  }

  // 生成带暗化背景的背包预览图
  const inventoryPath = path.join(outputDir, 'inventory.png');
  if (fs.existsSync(inventoryPath)) {
    await generateInventoryPreview(inventoryPath, outputDir);
    // 提取药水buff图标
    await extractBuffIcons(inventoryPath, outputDir);
  }

  await generateCover(packId, extracted, outputDir);

  return { packId, originalName, extracted, outputDir, description };
}

// 生成带暗化背景的背包预览图 inv.png
// 参考 inventory-processing.md 文档规则
async function generateInventoryPreview(inventoryPath, outputDir) {
  try {
    const metadata = await sharp(inventoryPath).metadata();
    const { width, height } = metadata;
    const scale = width / 256;

    // 裁剪主背包区域 (0,0,176,166) - 256-base 坐标
    const cropW = Math.round(176 * scale);
    const cropH = Math.round(166 * scale);

    const inventoryCrop = await sharp(inventoryPath)
      .extract({ left: 0, top: 0, width: cropW, height: cropH })
      .toBuffer();

    // 创建方形画布 (512x512)
    const canvasSize = 512;
    const padding = 24;

    // 计算缩放后的背包尺寸，保持宽高比，适应方形画布
    const availableSize = canvasSize - padding * 2;
    const invAspect = 176 / 166;
    let destW, destH;
    if (invAspect > 1) {
      destW = availableSize;
      destH = Math.round(availableSize / invAspect);
    } else {
      destH = availableSize;
      destW = Math.round(availableSize * invAspect);
    }

    // 居中位置
    const destX = Math.round((canvasSize - destW) / 2);
    const destY = Math.round((canvasSize - destH) / 2);

    // 缩放背包图像
    const resizedInventory = await sharp(inventoryCrop)
      .resize(destW, destH, { kernel: 'nearest' })
      .toBuffer();

    // 创建暗化背景渐变 (模拟 Minecraft drawDefaultBackground)
    // 顶部: RGBA(16,16,16,192/255) 底部: RGBA(16,16,16,208/255)
    // 使用 SVG 创建渐变
    const gradientSvg = `
      <svg width="${canvasSize}" height="${canvasSize}">
        <defs>
          <linearGradient id="darkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:rgb(16,16,16);stop-opacity:0.75"/>
            <stop offset="100%" style="stop-color:rgb(16,16,16);stop-opacity:0.82"/>
          </linearGradient>
        </defs>
        <rect width="${canvasSize}" height="${canvasSize}" fill="url(#darkGrad)"/>
      </svg>
    `;

    // 合成最终图像
    await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 139, g: 139, b: 139, alpha: 255 } // 灰色基底
      }
    })
      .composite([
        { input: Buffer.from(gradientSvg), blend: 'over' },
        { input: resizedInventory, left: destX, top: destY, blend: 'over' }
      ])
      .png()
      .toFile(path.join(outputDir, 'inv.png'));

  } catch (e) {
    console.error(`  Failed to generate inventory preview: ${e.message}`);
  }
}

// 从 particles.png 图集中裁剪指定粒子
async function extractParticleTiles(imagePath, outputDir) {
  try {
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;

    // particles.png 是 16x16 网格
    const tileW = Math.floor(width / 16);
    const tileH = Math.floor(height / 16);

    for (const [name, tile] of Object.entries(PARTICLE_TILES)) {
      const sx = tile.x * tileW;
      const sy = tile.y * tileH;

      await sharp(imagePath)
        .extract({ left: sx, top: sy, width: tileW, height: tileH })
        .png()
        .toFile(path.join(outputDir, `particle_${name}.png`));
    }
  } catch (e) {
    console.error(`  Failed to extract particle tiles: ${e.message}`);
  }
}

// 从 inventory.png 图集中裁剪药水buff图标
// 图标位于 v=198 开始，横向排列，每个 18x18
async function extractBuffIcons(inventoryPath, outputDir) {
  try {
    const metadata = await sharp(inventoryPath).metadata();
    const { width } = metadata;
    const scale = width / 256;

    const iconSize = Math.round(18 * scale);
    const baseV = Math.round(198 * scale);

    for (const [name, icon] of Object.entries(BUFF_ICONS)) {
      const sx = icon.col * iconSize;
      const sy = baseV + icon.row * iconSize;

      await sharp(inventoryPath)
        .extract({ left: sx, top: sy, width: iconSize, height: iconSize })
        .png()
        .toFile(path.join(outputDir, `buff_${name}.png`));
    }
  } catch (e) {
    console.error(`  Failed to extract buff icons: ${e.message}`);
  }
}

async function generateCover(packId, textures, outputDir) {
  const itemTextures = textures.items.slice(0, 8);
  if (itemTextures.length === 0) return;

  const composites = [];
  for (let i = 0; i < itemTextures.length; i++) {
    const inputPath = path.join(outputDir, itemTextures[i]);
    if (fs.existsSync(inputPath)) {
      const resized = await sharp(inputPath).resize(64, 64, { kernel: 'nearest' }).toBuffer();
      composites.push({
        input: resized,
        left: (i % 4) * 64,
        top: Math.floor(i / 4) * 64,
      });
    }
  }

  if (composites.length > 0) {
    await sharp({ create: { width: 256, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(composites)
      .png()
      .toFile(path.join(outputDir, 'cover.png'));
  }
}

async function main() {
  const packsDir = 'resourcepacks';
  if (!fs.existsSync(packsDir)) {
    console.log('No resourcepacks directory found');
    return;
  }

  const files = fs.readdirSync(packsDir).filter(f => f.endsWith('.zip'));
  const results = [];

  for (const file of files) {
    console.log(`Processing: ${file}`);
    try {
      const result = await extractPack(path.join(packsDir, file));
      results.push(result);
      console.log(`  Extracted: ${result.packId}`);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }

  fs.writeFileSync('data/extracted.json', JSON.stringify(results, null, 2));
  console.log(`Done. Processed ${results.length} packs.`);
}

main();
