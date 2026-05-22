// Renders the app icon (black squircle, white "type" + burnt-orange period) to a
// 1024px PNG using Electron's capturePage. Run: npx electron make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1024px;height:1024px;background:transparent;}
  .icon{
    position:absolute; inset:84px;            /* macOS-style padding */
    background:#0d0d0f; border-radius:228px;   /* rounded squircle-ish */
    display:grid; place-items:center;
  }
  .word{
    font-family:'Courier Prime', monospace; font-weight:700;
    font-size:226px; letter-spacing:.01em; color:#ffffff;
  }
  .dot{ color:#df5a26; }
</style></head>
<body><div class="icon"><span class="word">type<span class="dot">.</span></span></div></body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: false },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 2000));   // let the webfont load + paint
  const img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, 'build', 'icon-1024.png'), img.toPNG());
  console.log('wrote build/icon-1024.png');
  app.quit();
});
