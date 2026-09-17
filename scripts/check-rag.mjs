import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

app.setPath('userData', fileURLToPath(new URL('../.benchmark-profile', import.meta.url)));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 180, height: 100, useContentSize: true });
  await win.loadFile(fileURLToPath(new URL('./check-rag.html', import.meta.url)));
  await win.webContents.executeJavaScript('new Promise(r => ragReady ? r() : addEventListener("load", r, {once:true}))');
  const pixels = await win.webContents.executeJavaScript(`(() => {
    const d=document.querySelector('canvas').getContext('2d').getImageData(0,0,180,100).data;
    let textured=0; for(let i=0;i<d.length;i+=4) if(Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])>12) textured++;
    return textured;
  })()`);
  assert.ok(pixels > 1000, 'Rag should contain visible colored texture');
  const file = fileURLToPath(new URL('../.benchmark-profile/rag-preview.png', import.meta.url));
  writeFileSync(file, (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ pixels, preview: file }));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
