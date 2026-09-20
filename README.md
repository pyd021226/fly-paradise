# 果蝇乐园

Windows 桌面果蝇。仓库：[pyd021226/fly-paradise](https://github.com/pyd021226/fly-paradise)

**两个版本，每个版本两种装法（安装包 / 便携版），一个 Release 里共 4 个 exe。** 下载：[Releases](https://github.com/pyd021226/fly-paradise/releases/latest)

下表文件名里的 `<版本>` 就是 `package.json` 里的版本号，当前是 `0.3.6`。

| 文件 | 给谁用 |
|---|---|
| `fly-paradise-setup-<版本>.exe` | 果蝇乐园安装包。自己养，成虫最多 12 只，12 只全绿通关。开机启动默认关。 |
| `fly-paradise-portable-<版本>.exe` | 果蝇乐园便携版。免安装单文件，双击即用，存档放在 exe 旁边。 |
| `fly-paradise-welfare-setup-<版本>.exe` | 果蝇乐园造福版安装包。适合装到朋友的电脑。开机默认自启动。产卵更多，数量无上限。 |
| `fly-paradise-welfare-portable-<版本>.exe` | 造福版便携版。玩法同上，免安装单文件。 |

每个 Release 还带一个 `SHA256SUMS.txt`。

## 便携版

双击 exe 直接用，不写 `%APPDATA%`：存档、设置、最高纪录都在 exe 同目录的
`fly-paradise-data\`（造福版是 `fly-paradise-welfare-data\`）里。把 exe 和这个文件夹一起
拷到 U 盘或另一台机器，接着养。目录不可写（只读盘、网络盘）时自动退回默认位置。

开机启动开关在面板里，便携版勾上后注册的是便携 exe 本身的路径（不是运行时解压出来的临时副本）。

## 源码运行

```
npm install
npm start
```

造福版预览：`npm run start:annoy`

## 打包

```
npm run dist           # 果蝇乐园：安装包 + 便携版
npm run dist:annoy     # 果蝇乐园造福版
npm run dist:all       # 两个版本都打（共 4 个 exe）
```

只想要某一种：`npm run dist:portable`（便携版）、`npm run dist:nsis`（安装包）。
产物一律在 `release/`，文件名由 `scripts/build.mjs` 按版本号和口味生成。
打完会校验产物存在、并核对包内 `flavor.json` 口味是否正确；无论成败，`flavor.json` 都会恢复成 `breed`。

## 自动打包

打 tag 就会自动出包并建 Release：

```
# 先改 package.json 的 version，再打同名 tag
npm version patch --no-git-tag-version
git commit -am "版本 0.3.7。"
git tag v0.3.7 && git push origin master --tags
```

- `Release`（push `v*` tag）：windows-latest 上跑 `npm run dist:all`，4 个 exe + `SHA256SUMS.txt` 挂到 GitHub Release。tag 与 `package.json` 版本不一致会直接失败。也可以在 Actions 页手动 `workflow_dispatch`，只构建不发版。
- `CI`（push master / PR）：同样完整打一遍包，产物放在 workflow 的 Artifacts 里，用来在合并前确认还能打包。
