'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { startServer } = require('./server');
const { runZoom } = require('./zoom');
const { VideoStore } = require('./store');
const { extractVideoId, extractStartSeconds } = require('../shared/youtube');

// Zoom 공유 창에서 글자 인식(OCR)으로 찾으므로 영문 대문자로 둔다.
const PLAYER_TITLE = 'ZOOMAUTO PLAYER';

let controlWin = null;
let playerWin = null;
let playerReady = false;
let serverInfo = null;
let zoomBusy = false;
let testStarted = false;
let pendingSharePlay = false; // 목록에서 재생을 눌렀을 때: 영상 준비가 끝나면 공유 시작
let store = null;
let sharedByApp = false; // 앱이 시작한 공유인지 (영상 종료 시 자동 중지 대상)

function sendToControl(channel, data) {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send(channel, data);
}
function playerCommand(cmd) {
  if (playerWin && !playerWin.isDestroyed()) playerWin.webContents.send('player-command', cmd);
}

function createControlWindow() {
  controlWin = new BrowserWindow({
    width: 640,
    height: 900,
    title: '수업 영상 조작',
    webPreferences: { preload: path.join(__dirname, 'preload-control.js') },
  });
  controlWin.setMenuBarVisibility(false);
  controlWin.loadFile(path.join(__dirname, '../renderer/index.html'));
  controlWin.on('closed', () => {
    controlWin = null;
    if (playerWin && !playerWin.isDestroyed()) playerWin.close();
  });
}

function openPlayer(videoId, start, end) {
  playerReady = false;
  const url = `${serverInfo.origin}/player.html?v=${encodeURIComponent(videoId)}&start=${start || 0}&end=${end || 0}`;
  if (playerWin && !playerWin.isDestroyed()) {
    playerWin.loadURL(url);
    playerWin.show();
    return;
  }
  playerWin = new BrowserWindow({
    width: 1280,
    height: 760,
    title: PLAYER_TITLE,
    backgroundColor: '#000000',
    webPreferences: { preload: path.join(__dirname, 'preload-player.js') },
  });
  playerWin.setMenuBarVisibility(false);
  // 페이지가 제목을 바꾸지 못하게 고정
  playerWin.on('page-title-updated', (e) => e.preventDefault());
  playerWin.on('closed', () => {
    playerWin = null;
    playerReady = false;
    pendingSharePlay = false;
    sendToControl('player-status', { state: 'closed' });
    // 공유 중에 영상 창을 직접 닫았으면 공유도 멈춘다
    if (sharedByApp) stopShare();
  });
  playerWin.loadURL(url);
}

async function stopShare() {
  // 상태 확인 같은 짧은 작업이 진행 중이면 끝날 때까지 잠깐 기다린다
  for (let i = 0; i < 25 && zoomBusy; i++) await new Promise((r) => setTimeout(r, 200));
  if (zoomBusy) return { ok: false, error: 'BUSY', message: 'Zoom 작업이 진행 중입니다. 잠시 후 다시 눌러 주세요.' };
  zoomBusy = true;
  sendToControl('zoom-status', { state: 'stopping' });
  const r = await runZoom('stop');
  zoomBusy = false;
  sharedByApp = false;
  sendToControl('zoom-status', r.ok ? { state: 'stopped' } : { state: 'error', message: r.message || '공유를 멈추지 못했습니다. Zoom에서 [공유 중지]를 눌러 주세요.' });
  return r;
}

// --- 영상 목록 ---
ipcMain.handle('videos-list', () => store.list());
ipcMain.handle('videos-name', () => store.name);
ipcMain.handle('videos-clear', () => store.clear());

const FILTERS = [{ name: '영상 목록', extensions: ['json'] }];
// 현재 목록을 이름을 정해 파일로 저장
ipcMain.handle('videos-export', async () => {
  const r = await dialog.showSaveDialog(controlWin, {
    title: '영상 목록 저장',
    defaultPath: path.join(app.getPath('documents'), (store.name || '영상 목록') + '.json'),
    filters: FILTERS,
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try { return store.exportTo(r.filePath); } catch (e) { return { ok: false, error: '저장하지 못했습니다: ' + e.message }; }
});
// 저장해 둔 목록 파일 불러오기 (현재 목록을 바꿈)
ipcMain.handle('videos-import', async () => {
  if (zoomBusy || sharedByApp) return { ok: false, error: '영상을 공유 중입니다. 먼저 [강의로 복귀]를 눌러 주세요.' };
  const r = await dialog.showOpenDialog(controlWin, {
    title: '영상 목록 불러오기',
    defaultPath: app.getPath('documents'),
    filters: FILTERS,
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
  return store.importFrom(r.filePaths[0]);
});
ipcMain.handle('videos-add', (_e, v) => store.add(v));
ipcMain.handle('videos-update', (_e, id, v) => store.update(id, v));
ipcMain.handle('videos-remove', (_e, id) => store.remove(id));
ipcMain.handle('videos-move', (_e, id, delta) => store.move(id, delta));

// 목록의 영상 하나를 열고, 준비되면 바로 Zoom 공유 + 재생
ipcMain.handle('videos-play', async (_e, id) => {
  const v = store.get(id);
  if (!v) return { ok: false, error: '영상을 찾을 수 없습니다.' };
  if (zoomBusy) return { ok: false, error: 'Zoom 작업이 진행 중입니다. 잠시 후 다시 눌러 주세요.' };
  // 다른 영상을 공유 중이면 그 공유를 먼저 멈추고 새 영상으로 넘어간다
  if (sharedByApp) await stopShare();
  const videoId = extractVideoId(v.url);
  const start = v.start !== null && v.start !== undefined ? v.start : extractStartSeconds(v.url);
  pendingSharePlay = true;
  openPlayer(videoId, start, v.end);
  return { ok: true };
});

ipcMain.handle('load-video', (_e, input) => {
  const videoId = extractVideoId(input);
  if (!videoId) return { ok: false, error: '올바른 YouTube 주소가 아닙니다. 주소를 다시 확인해 주세요.' };
  openPlayer(videoId, extractStartSeconds(input));
  return { ok: true, videoId };
});

ipcMain.handle('player-command', async (_e, command) => {
  if (!playerWin || playerWin.isDestroyed()) {
    // 영상 창이 이미 닫혔어도 [강의로 복귀]는 공유를 멈추고 상태를 정리한다
    if (command === 'close') { await stopShare(); return { ok: true }; }
    return { ok: false, error: '영상 창이 열려 있지 않습니다.' };
  }
  if (command === 'close') {
    playerCommand('pause');
    if (sharedByApp) await stopShare();
    if (playerWin && !playerWin.isDestroyed()) playerWin.close();
    return { ok: true };
  }
  playerCommand(command);
  return { ok: true };
});

// 영상 창을 Zoom으로 공유(소리 포함)하고, 공유가 확인되면 재생한다
ipcMain.handle('zoom-share-play', () => sharePlay());
async function sharePlay() {
  if (!playerWin || playerWin.isDestroyed() || !playerReady) {
    return { ok: false, message: '먼저 [영상 열기]로 영상을 준비해 주세요.' };
  }
  if (zoomBusy) return { ok: false, message: 'Zoom 작업이 진행 중입니다.' };
  playerCommand('pause');
  zoomBusy = true;
  sendToControl('zoom-status', { state: 'starting' });
  const r = await runZoom('start');
  zoomBusy = false;
  if (!r.ok || !r.sharing) {
    sendToControl('zoom-status', { state: 'error', message: r.message || '공유를 시작하지 못했습니다.', manual: true });
    return r;
  }
  sharedByApp = true;
  sendToControl('zoom-status', { state: 'sharing', optimized: r.optimized !== false });
  // 공유 화면이 참가자에게 뜰 시간을 조금 준 뒤 재생
  setTimeout(() => playerCommand('restart'), 1500);
  return r;
}

ipcMain.handle('zoom-stop', () => stopShare());

// 강사가 Zoom에서 직접 공유를 멈췄는지 주기적으로 확인한다
setInterval(async () => {
  if (!sharedByApp || zoomBusy) return;
  zoomBusy = true;
  const r = await runZoom('status');
  zoomBusy = false;
  if (sharedByApp && r.ok && r.sharing === false) {
    sharedByApp = false;
    playerCommand('pause');
    sendToControl('zoom-status', { state: 'stopped', external: true });
  }
}, 4000);

// 플레이어 페이지에서 오는 상태 보고를 조작 화면으로 전달
ipcMain.on('player-status', (_e, status) => {
  console.log('[player-status]', JSON.stringify(status));
  if (status.state === 'ready') playerReady = true;
  sendToControl('player-status', status);
  if (status.state === 'ready' && pendingSharePlay) { pendingSharePlay = false; sharePlay(); }
  if (status.state === 'error') pendingSharePlay = false;
  // 영상이 끝나면 앱이 시작한 공유를 자동으로 멈춘다 (카메라 화면으로 복귀)
  if (status.state === 'ended' && sharedByApp) stopShare();
  // 자동 테스트: 준비되면 재생, 끝나면 종료
  if (process.env.ZOOMAUTO_TEST_URL && !process.env.ZOOMAUTO_TEST_NOPLAY) {
    // ZOOMAUTO_TEST_SHARE=1 이면 Zoom 공유 흐름 전체를 시험한다
    if (status.state === 'ready' && !testStarted) {
      testStarted = true;
      if (process.env.ZOOMAUTO_TEST_SHARE) setTimeout(() => sharePlay(), 1000);
      else playerCommand('play');
    }
    if (status.state === 'ended' || status.state === 'error') setTimeout(() => app.quit(), 8000);
  }
});

// 버튼을 누른 뒤 재생을 시작하므로 자동재생 제한을 끈다
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  store = new VideoStore(path.join(app.getPath('userData'), 'videos.json'));
  serverInfo = await startServer(path.join(__dirname, '../player'));
  createControlWindow();
  if (process.env.ZOOMAUTO_TEST_URL) {
    const input = process.env.ZOOMAUTO_TEST_URL;
    const id = extractVideoId(input);
    console.log('[test] videoId', id);
    if (id) openPlayer(id, extractStartSeconds(input));
  }
});

app.on('window-all-closed', () => app.quit());
