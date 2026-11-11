'use strict';
// 사용 설명서 HTML을 PDF로 만든다: npx electron scripts/make-manual-pdf.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../docs/manual.html');
const OUT = path.join(__dirname, '../docs/사용설명서.pdf');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile(SRC);
  const pdf = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;text-align:center;font-size:8pt;color:#9ca3af;font-family:Malgun Gothic">Zoom 수업 영상 사용 설명서 · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  fs.writeFileSync(OUT, pdf);
  console.log('PDF 저장:', OUT, Math.round(pdf.length / 1024) + 'KB');
  app.quit();
});
