// 动态渲染 Minecraft 药水（喷溅型）
function renderPotion(canvas, overlayPath, bottlePath, colorHex) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const overlay = new Image();
  const bottle = new Image();

  let loaded = 0;
  const onLoad = () => {
    if (++loaded === 2) draw();
  };

  overlay.src = overlayPath;
  bottle.src = bottlePath;
  overlay.onload = onLoad;
  bottle.onload = onLoad;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制并染色液体
    ctx.drawImage(overlay, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(overlay, 0, 0);

    // 绘制瓶子
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bottle, 0, 0);
  }
}

// 药水颜色配置
const POTION_COLORS = {
  instant_health: '#F82423',
  fire_resistance: '#E49A3A',
  night_vision: '#1F1FA1',
  speed: '#7CAFC6',
  water: '#385DC6',
  poison: '#4E9331'
};
