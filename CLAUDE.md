# VALE - Resource Pack Storage Architecture

## 仓库结构

- **主站** `Sakyvo/Sakyvo.github.io` — 仅存放网站前后端代码、缩略图、数据索引
- **材质包库** `Sakyvo/packs-001` ~ `packs-NNN` — 存放 .zip 材质包文件

## 材质包仓库规则

- 每个仓库存储上限 **5GB**
- 材质包按**修改日期升序**依次填充仓库
- 仓库满时，根目录创建 `!  FULL  !` 标记文件
- 新包上传到**第一个没有 FULL 标记**的仓库
- 所有仓库用完时，自动创建新仓库（编号递增：packs-006, packs-007...）

## 关键文件

| 文件 | 用途 |
|------|------|
| `data/pack-registry.json` | 每个包所在仓库的映射表 |
| `scripts/migrate-packs.js` | 初始迁移脚本（一次性） |
| `scripts/upload-pack.js` | 上传新包到可用仓库 |
| `scripts/extract-textures.js` | 提取材质缩略图 |
| `scripts/generate-index.js` | 生成索引（自动读取 registry 生成下载链接） |

## pack-registry.json 格式

```json
{
  "包名.zip": {
    "repo": "packs-001",
    "repoNum": 1,
    "size": 12345678
  }
}
```

## 下载链接生成规则

`generate-index.js` 根据 `pack-registry.json` 自动生成：
- GitHub: `https://raw.githubusercontent.com/Sakyvo/{repo}/main/resourcepacks/{name}.zip`
- Mirror: `https://ghfast.top/https://raw.githubusercontent.com/Sakyvo/{repo}/main/resourcepacks/{name}.zip`

若 registry 中无记录，回退到主站 `Sakyvo.github.io` 路径。

## 上传新材质包流程

```bash
# 1. 放入 resourcepacks/ 目录
# 2. 运行提取脚本
node scripts/extract-textures.js
# 3. 上传到 packs 仓库
node scripts/upload-pack.js resourcepacks/新包.zip
# 4. 重新生成索引
node scripts/generate-index.js
# 5. 提交主站更改
git add data/ thumbnails/ && git commit && git push
```

## 注意事项

- **不要**在主站 resourcepacks/ 目录保留已迁移的 zip 文件
- 上传脚本会自动更新 `pack-registry.json`
- 每次添加新包后必须重新运行 `generate-index.js` 更新下载链接
- 本地**不需要**保留 packs-NNN 仓库文件夹，上传脚本会按需临时克隆
- `fileSize` 从 `pack-registry.json` 的 `size` 字段读取（字节），本地无 zip 文件时不影响索引生成
- Windows 文件名大小写不敏感，注意 git 大小写冲突
- 包名中的特殊字符（§、!、#）在 URL 中需要 encodeURIComponent
