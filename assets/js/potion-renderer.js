// 动态渲染 Minecraft 药水（喷溅型），支持动画帧条带
function renderPotion(canvas, overlayPath, bottlePath, colorHex) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const overlay = new Image();
  const bottle = new Image();

  let loaded = 0;
  const onLoad = () => { if (++loaded === 2) init(); };

  overlay.src = overlayPath;
  bottle.src = bottlePath;
  overlay.onload = onLoad;
  bottle.onload = onLoad;

  function getFrameInfo(img) {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (h > w && h % w === 0) return { frames: h / w, size: w };
    return { frames: 1, size: w };
  }

  function drawFrame(oFrame, bFrame) {
    const oInfo = getFrameInfo(overlay);
    const bInfo = getFrameInfo(bottle);
    const size = Math.max(oInfo.size, bInfo.size);
    canvas.width = size;
    canvas.height = size;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    // Draw and tint overlay
    ctx.drawImage(overlay, 0, oFrame * oInfo.size, oInfo.size, oInfo.size, 0, 0, size, size);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(overlay, 0, oFrame * oInfo.size, oInfo.size, oInfo.size, 0, 0, size, size);

    // Draw bottle
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bottle, 0, bFrame * bInfo.size, bInfo.size, bInfo.size, 0, 0, size, size);
  }

  function init() {
    const oInfo = getFrameInfo(overlay);
    const bInfo = getFrameInfo(bottle);
    const maxFrames = Math.max(oInfo.frames, bInfo.frames);

    drawFrame(0, 0);

    if (maxFrames > 1) {
      let frame = 0;
      setInterval(() => {
        frame = (frame + 1) % maxFrames;
        drawFrame(frame % oInfo.frames, frame % bInfo.frames);
      }, 100);
    }
  }
}

const POTION_COLORS = {
  instant_health: '#F82423',
  fire_resistance: '#E49A3A',
  night_vision: '#1F1FA1',
  speed: '#7CAFC6',
  water: '#385DC6',
  poison: '#4E9331'
};
