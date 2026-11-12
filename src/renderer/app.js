'use strict';
const $ = (id) => document.getElementById(id);
const MAX = 20;
const playerControls = ['play', 'pause', 'restart', 'back'];
let videos = [];
let editingId = null;
let activeId = null;
let dirty = false; // 파일로 저장한 뒤 목록을 고쳤는지
function setDirty(v) { dirty = v; }

function setBox(id, text, kind = '') {
  $(id).textContent = text;
  $(id).className = 'box ' + kind;
}
const setStatus = (text, kind) => setBox('status', text, kind);
function setPlayerEnabled(on) { playerControls.forEach((id) => { $(id).disabled = !on; }); }
function showManual(on) { $('manual').style.display = on ? 'block' : 'none'; }

function fmtTime(sec) {
  if (sec === null || sec === undefined) return null;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  children.forEach((c) => e.append(c));
  return e;
}

async function refresh() {
  videos = await window.app.videos.list();
  const name = await window.app.videos.name();
  $('fileName').textContent = '저장 파일: ' + (name ? name + (dirty ? ' (수정됨 · 저장 안 함)' : '') : '(저장 안 됨)');
  $('count').textContent = `(${videos.length}/${MAX})`;
  $('addBtn').disabled = videos.length >= MAX;
  const list = $('list');
  list.replaceChildren();
  if (!videos.length) {
    list.append(el('div', { className: 'empty', textContent: '등록된 영상이 없습니다. [+ 영상 등록]을 눌러 추가하세요.' }));
    return;
  }
  videos.forEach((v, i) => {
    const range = [fmtTime(v.start) || '처음', fmtTime(v.end) || '끝'].join(' ~ ');
    const meta = range + (v.memo ? ` · ${v.memo}` : '');
    const tool = (text, fn, cls = 'small') => {
      const b = el('button', { className: cls, textContent: text });
      b.addEventListener('click', fn);
      return b;
    };
    const play = tool('▶ 공유 재생', () => playVideo(v), 'playBtn');
    const up = tool('▲', async () => { await window.app.videos.move(v.id, -1); setDirty(true); refresh(); });
    const down = tool('▼', async () => { await window.app.videos.move(v.id, 1); setDirty(true); refresh(); });
    up.disabled = i === 0; down.disabled = i === videos.length - 1;
    const tools = el('div', { className: 'tools' }, [
      up,
      tool('수정', () => openForm(v)),
      tool('삭제', async () => {
        if (!confirm(`"${v.title}"을(를) 목록에서 지울까요?`)) return;
        await window.app.videos.remove(v.id);
        setDirty(true);
        refresh();
      }, 'small del'),
      down,
    ]);
    const item = el('div', { className: 'item' + (v.id === activeId ? ' active' : '') }, [
      el('div', { className: 'num', textContent: String(i + 1) }),
      el('div', { className: 'info' }, [
        el('div', { className: 'title', textContent: v.title }),
        el('div', { className: 'meta', textContent: meta }),
      ]),
      play,
      tools,
    ]);
    list.append(item);
  });
}

async function playVideo(v) {
  showManual(false);
  const r = await window.app.videos.play(v.id);
  if (!r.ok) return setStatus(r.error, 'error');
  activeId = v.id;
  refresh();
  setStatus(`"${v.title}" 영상을 준비하는 중입니다…\n준비되면 Zoom 공유를 자동으로 시작합니다.`);
}

// --- 목록 파일 저장/불러오기 ---
$('saveFile').addEventListener('click', async () => {
  const r = await window.app.videos.exportFile();
  if (r.canceled) return;
  if (!r.ok) return setStatus(r.error, 'error');
  setDirty(false);
  await refresh();
  setStatus(`목록을 "${r.name}" 파일로 저장했습니다.`, 'ok');
});
$('openFile').addEventListener('click', async () => {
  if (videos.length && !confirm('불러오면 지금 목록이 불러온 목록으로 바뀝니다. 계속할까요?')) return;
  const r = await window.app.videos.importFile();
  if (r.canceled) return;
  if (!r.ok) return setStatus(r.error, 'error');
  setDirty(false);
  activeId = null;
  await refresh();
  setStatus(`"${r.name}" 목록을 불러왔습니다. (영상 ${r.count}개)`, 'ok');
});

// --- 등록/수정 폼 ---
function openForm(v) {
  editingId = v ? v.id : null;
  $('formTitle').textContent = v ? '영상 수정' : '영상 등록';
  $('fTitle').value = v ? v.title : '';
  $('fUrl').value = v ? v.url : '';
  $('fStart').value = v && v.start !== null ? v.start : '';
  $('fEnd').value = v && v.end !== null ? v.end : '';
  $('fMemo').value = v ? v.memo : '';
  $('formErr').style.display = 'none';
  $('form').style.display = 'block';
  $('fTitle').focus();
}
function closeForm() { $('form').style.display = 'none'; editingId = null; }

$('addBtn').addEventListener('click', () => openForm(null));
$('cancel').addEventListener('click', closeForm);
$('save').addEventListener('click', async () => {
  const data = { title: $('fTitle').value, url: $('fUrl').value, start: $('fStart').value, end: $('fEnd').value, memo: $('fMemo').value };
  const r = editingId ? await window.app.videos.update(editingId, data) : await window.app.videos.add(data);
  if (!r.ok) {
    $('formErr').textContent = r.error;
    $('formErr').style.display = 'block';
    return;
  }
  closeForm();
  setDirty(true);
  refresh();
});

// --- 재생 조작 ---
$('play').addEventListener('click', () => window.app.command('play'));
$('pause').addEventListener('click', () => window.app.command('pause'));
$('restart').addEventListener('click', () => window.app.command('restart'));
$('stopShare').addEventListener('click', () => window.app.zoomStop());
$('back').addEventListener('click', () => window.app.command('close'));

window.app.onZoomStatus((s) => {
  switch (s.state) {
    case 'starting': setBox('zoom', 'Zoom: 공유를 시작하는 중… (마우스를 움직이지 마세요)'); break;
    case 'sharing':
      setBox('zoom', 'Zoom: 영상 창을 소리와 함께 공유 중' + (s.optimized ? '' : '\n("비디오 공유에 최적화"는 켜지 못했습니다. 영상이 끊기면 Zoom 공유 창에서 직접 체크해 주세요.)'), 'ok');
      break;
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
    case 'ready': setPlayerEnabled(true); setStatus(`준비됨: ${s.title || '영상'}`); break;
    case 'playing': setStatus('재생 중'); break;
    case 'paused': setStatus('일시정지됨'); break;
    case 'buffering': setStatus('불러오는 중…'); break;
    case 'ended': setStatus('영상이 끝났습니다. 강의를 계속하세요.', 'ok'); break;
    case 'error': setPlayerEnabled(false); $('back').disabled = false; setStatus(s.message, 'error'); break;
    case 'closed': setPlayerEnabled(false); activeId = null; refresh(); setStatus('영상 창이 닫혔습니다. 강의를 계속하세요.'); break;
  }
});

refresh();
