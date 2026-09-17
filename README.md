# 果蝇乐园

Windows 桌面果蝇。仓库里有 **两份安装包，装一个就行**。

## 选哪个

| 安装包 | 给谁用 |
|---|---|
| **果蝇乐园** | 自己养。成虫最多 12 只，12 只全绿通关。开机启动默认关。 |
| **果蝇乐园造福版** | 装到别的电脑上。窗口同样叫果蝇乐园。开机启动默认开，透视默认开。 |

到 [Releases](../../releases) 下载对应的 `Setup` 安装文件。

## 源码运行

```
npm install
npm start
```

造福版预览：

```
npm run start:annoy
```

## 打包

```
npm run dist
npm run dist:annoy
```

安装包在 `release/` 里。
