# Preview 透明背景修复说明

## 问题现象

部分提取后的 preview 贴图在深色背景里看起来正常，但放到站点浅色卡片上会出现一层假的灰色底。

常见表现：

- 剑、鱼竿外围有一层发灰方块
- 药水瓶透明区域出现暗色蒙版
- `cover.png` 继承同样的问题，因为它直接拼合这些 preview 贴图

## 根因

部分材质包源图并不是真正的纯透明像素，而是“深色 RGB + 很低 alpha”的像素，例如：

- `(1, 1, 1, 4)`
- `(1, 1, 1, 8)`
- `(77, 77, 77, 10)`

这类像素在 Minecraft 风格的深色界面里几乎不可见，但在站点浅底卡片上会被看成灰底。

## 修复策略

仓库现在会在以下环节统一清理 preview 用贴图：

- 提取出来的物品 preview PNG
- 保存的药水 preview 资源
- 生成的 `cover.png`
- SBI 指纹生成输入

共享逻辑位于 [scripts/thumbnail-preview-utils.js](K:/VALE/scripts/thumbnail-preview-utils.js)。

当前清理规则：

- alpha `<= 16`
- RGB 最大值 `<= 96`
- 通道差值 `<= 12`

满足以上条件的低透明深色中性像素会被直接改成全透明，以去掉假背景，同时尽量不伤及正常可见像素。

## 后续规则

当你新增或修改 preview 生成逻辑时，遵守以下规则：

1. 不要把本应透明的贴图先铺到黑底、灰底或其他不透明背景上，除非目标产物本来就是合成预览图。
2. 物品类 preview 资源保持 RGBA PNG，不要丢失 alpha。
3. 如果使用 `sharp` 读写像素，读取时保留 `ensureAlpha()`，输出时显式写成 `png()`。
4. 面向 preview 展示的贴图在落盘前先经过 `sanitizePreviewPngBuffer(...)`。
5. 生成 `cover.png` 时使用清理后的首帧，而不是原始提取文件。
6. 如果改了贴图提取规则，除了重建 preview，还要同步重建 SBI 数据。

## 常用命令

批量修复现有 `thumbnails/` 下的 preview 透明问题：

```bash
npm run fix:preview-alpha
```

在 preview 资源变更后重建 SBI 指纹数据：

```bash
npm run sbi:data
```

完整重跑贴图提取：

```bash
npm run extract
```

## 涉及文件

- [scripts/extract-textures.js](K:/VALE/scripts/extract-textures.js)
- [scripts/generate-sbi-data.js](K:/VALE/scripts/generate-sbi-data.js)
- [scripts/fix-thumbnail-preview-alpha.js](K:/VALE/scripts/fix-thumbnail-preview-alpha.js)
- [scripts/thumbnail-preview-utils.js](K:/VALE/scripts/thumbnail-preview-utils.js)

## 验证清单

- preview 贴图四角在应透明处确实为透明
- `cover.png` 不再出现剑或药水的灰底方块
- 站点浅色卡片上的 pack detail preview 显示干净
- preview 清理后已同步重建 SBI 数据
