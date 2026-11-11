'use strict';
const $ = (id) => document.getElementById(id);
const controls = ['share', 'play', 'pause', 'restart', 'back'];

function setBox(id, text, kind = '') {
  $(id).textContent = text;
  $(id).className = 'box ' + kind;
}
const setStatus = (text, kind) => setBox('status', text, kind);
function setEnabled(on) { controls.forEach((id) => { $(id).disabled = !on; }); }
function showManual(on) { $('manual').style.display = on ? 'block' : 'none'; }

$('load').addEventListener('click', async () => {
  showManual(false);
  const res = await window.app.loadVideo($('url').value);
  if (!res.ok) return setStatus(res.error, 'error');
  setStatus('영상을 불러오는 중입니다…');
});
$('url').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('load').click(); });

$('share').addEventListener('click', async () => {
  showManual(false);
  $('share').disabled = true;
  const r = await window.app.zoomSharePlay();
  $('share').disabled = false;
  if (!r.ok && r.message && !r.error) setStatus(r.message, 'error');
});
$('play').addEventListener('click', () => window.app.command('play'));
$('pause').addEventListener('click', () => window.app.command('pause'));
$('restart').addEventListener('click', () => window.app.command('restart'));
$('stopShare').addEventListener('click', () => window.app.zoomStop());
$('back').addEventListener('click', () => window.app.command('close'));

window.app.onZoomStatus((s) => {
  switch (s.state) {
    case 'starting': setBox('zoom', 'Zoom: 공유를 시작하는 중… (마우스를 움직이지 마세요)'); break;
    case 'sharing': setBox('zoom', 'Zoom: 영상 창을 소리와 함께 공유 중', 'ok'); break;
    case 'stopping': setBox('zoom', 'Zoom: 공유를 멈추는 중…'); break;
    case 'stopped': setBox('zoom', 'Zoom: 공유를 멈췄습니다. 카메라 화면으로 돌아왔습니다.'); break;
    case 'error':
      setBox('zoom', 'Zoom: ' + s.message + (s.manual ? '\n영상은 재생하지 않았습니다.' : ''), 'error');
      if (s.manual) showManual(true);
      break;
  }
});

window.app.onStatus((s) => {
  switch (s.state) {
    case 'ready': setEnabled(true); setStatus(`준비됨: ${s.title || '영상'}\n[② Zoom 공유하며 재생]을 누르세요.`); break;
    case 'playing': setStatus('재생 중'); break;
    case 'paused': setStatus('일시정지됨'); break;
    case 'buffering': setStatus('불러오는 중…'); break;
    case 'ended': setStatus('영상이 끝났습니다. 강의를 계속하세요.', 'ok'); break;
    case 'error': setEnabled(false); $('back').disabled = false; setStatus(s.message, 'error'); break;
    case 'closed': setEnabled(false); setStatus('영상 창이 닫혔습니다. 강의를 계속하세요.'); break;
  }
});
