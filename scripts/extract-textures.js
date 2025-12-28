const AdmZip = require('adm-zip');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const KEY_TEXTURES = {
  items: [
    ['assets/minecraft/textures/items/diamond_sword.png'],
    ['assets/minecraft/textures/items/ender_pearl.png'],
    ['assets/minecraft/textures/items/potion_bottle_splash.png'],
    ['assets/minecraft/textures/items/steak.png', 'assets/minecraft/textures/items/beef_cooked.png'],
    ['assets/minecraft/textures/items/iron_sword.png'],
    ['assets/minecraft/textures/items/fishing_rod_uncast.png'],
    ['assets/minecraft/textures/items/apple_golden.png'],
    ['assets/minecraft/textures/items/golden_carrot.png', 'assets/minecraft/textures/items/carrot_golden.png'],
  ],
  blocks: [
    ['assets/minecraft/textures/blocks/grass_side.png'],
    ['assets/minecraft/textures/blocks/stone.png'],
    ['assets/minecraft/textures/blocks/wool_colored_white.png'],
  ],
  armor: [
    ['assets/minecraft/textures/models/armor/diamond_layer_1.png'],
    ['assets/minecraft/textures/models/armor/diamond_layer_2.png'],
  ],
  gui: [['assets/minecraft/textures/gui/icons.png']],
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
      let entry = null;
      const filename = path.basename(alternatives[0]);
      for (const alt of alternatives) {
        entry = zip.getEntry(alt);
        if (entry) break;
      }
      if (entry) {
        fs.writeFileSync(path.join(outputDir, filename), entry.getData());
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

  await generateCover(packId, extracted, outputDir);

  return { packId, originalName, extracted, outputDir, description };
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
