# 果蝇乐园

Windows 桌面果蝇。仓库：[pyd021226/fly-paradise](https://github.com/pyd021226/fly-paradise)

**两份安装包，不同的模式。** 下载：[Releases](https://github.com/pyd021226/fly-paradise/releases/tag/v0.3.5)

| 文件 | 给谁用 |
|---|---|
| **fly-paradise-setup-0.3.5.exe** | 果蝇乐园。自己养，成虫最多 12 只，12 只全绿通关。开机启动默认关。 |
| **fly-paradise-welfare-setup-0.3.5.exe** | 果蝇乐园造福版。适合装到朋友的电脑。开机默认自启动。产卵更多，数量无上限。 |

## 源码运行

```
npm install
npm start
```

造福版预览：`npm run start:annoy`

## 托盘

控制面板关闭或最小化后，程序会继续留在系统托盘运行。单击托盘图标可以重新打开面板；右键菜单可以暂停、快进、切换全图透视，也可以拿出苍蝇拍和抹布。

需要完全关闭时，请使用控制面板里的“退出”，或托盘菜单里的“退出果蝇乐园”。

## 打包

```
npm run dist
npm run dist:annoy
```
