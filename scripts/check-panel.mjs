import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

app.setPath('userData', fileURLToPath(new URL('../.benchmark-profile', import.meta.url)));
const deadline = setTimeout(() => app.exit(1), 20000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 300, height: 640, useContentSize: true,
    webPreferences: { preload: fileURLToPath(new URL('../preload-panel.mjs', import.meta.url)), sandbox: false } });
  await win.loadFile(fileURLToPath(new URL('../renderer/panel.html', import.meta.url)));
  win.webContents.send('state', { breed: true });
  win.webContents.send('life-stats', { adults: 192, eggs: 192, l1: 192, l2: 192, l3: 192, pupae: 192, rainbow: 192, green: 192, breed: true });
  await new Promise(resolve => setTimeout(resolve, 200));
  const measure = () => win.webContents.executeJavaScript(`(() => {
    const thumb = getComputedStyle(document.documentElement, '::-webkit-scrollbar-thumb');
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight, quitBottom: document.getElementById('quit').getBoundingClientRect().bottom,
      thumbRadius: thumb.borderRadius, thumbClip: thumb.backgroundClip };
  })()`);
  const normal = await measure();
  assert.ok(normal.scrollHeight <= normal.height, 'Default panel should fit without vertical scrolling');
  assert.ok(normal.scrollWidth <= normal.width, 'No horizontal overflow');
  const file = fileURLToPath(new URL('../.benchmark-profile/panel-preview.png', import.meta.url));
  writeFileSync(file, (await win.webContents.capturePage()).toPNG());
  win.setContentSize(260, 320);
  const small = await measure();
  assert.ok(small.scrollWidth <= small.width, 'Small window should not overflow horizontally');
  assert.equal(small.thumbRadius, '999px', 'Scrollbar thumb should be fully rounded');
  assert.equal(small.thumbClip, 'content-box', 'Scrollbar thumb should render as a narrow pill');
  const smallFile = fileURLToPath(new URL('../.benchmark-profile/panel-preview-small.png', import.meta.url));
  writeFileSync(smallFile, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript('window.scrollTo(0,document.documentElement.scrollHeight)');
  const bottom = await measure();
  assert.ok(bottom.quitBottom <= bottom.height, 'Exit remains reachable by scrolling');
  console.log(JSON.stringify({normal,small,preview:file,smallPreview:smallFile}));
  clearTimeout(deadline); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
