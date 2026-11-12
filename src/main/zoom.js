'use strict';
const { execFile } = require('child_process');
const path = require('path');

// 설치본(asar)에서도 실행할 수 있게 asar.unpacked 경로를 우선 쓴다
const SCRIPT = path.join(__dirname, '../zoom/zoom-share.ps1').replace('app.asar', 'app.asar.unpacked');

const ERROR_TEXT = {
  NO_MEETING: 'Zoom 회의 창을 찾을 수 없습니다. 먼저 Zoom 회의에 들어가 주세요.',
  SHARE_DIALOG_NOT_OPENED: 'Zoom 공유 창이 열리지 않았습니다.',
  PLAYER_WINDOW_NOT_FOUND: '공유 목록에서 영상 창(ZOOMAUTO PLAYER)을 찾지 못했습니다.',
  SOUND_OPTION_NOT_FOUND: '공유 창에서 "소리 공유" 항목을 찾지 못했습니다.',
  SOUND_CHECK_FAILED: '"소리 공유"를 체크하지 못했습니다.',
  SHARE_BUTTON_NOT_FOUND: '공유 창에서 [공유] 버튼을 찾지 못했습니다.',
  SHARE_NOT_CONFIRMED: '공유가 시작되었는지 확인하지 못했습니다.',
};

// action: start | stop | status. 스크립트 마지막 줄의 JSON을 돌려준다.
function runZoom(action) {
  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Action', action],
      { timeout: 90000, windowsHide: true },
      (err, stdout) => {
        const lines = String(stdout || '').trim().split(/\r?\n/);
        let result;
        try { result = JSON.parse(lines[lines.length - 1]); } catch { result = { ok: false, error: err ? err.message : 'NO_OUTPUT' }; }
        if (!result.ok && result.error) result.message = ERROR_TEXT[result.error] || `Zoom 자동화 오류: ${result.error}`;
        console.log(`[zoom ${action}]`, JSON.stringify(result));
        resolve(result);
      });
  });
}

module.exports = { runZoom };
