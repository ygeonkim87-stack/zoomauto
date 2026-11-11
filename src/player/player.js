'use strict';
/* global YT */
const params = new URLSearchParams(location.search);
const videoId = params.get('v');
const startSec = Number(params.get('start')) || 0;
const endSec = Number(params.get('end')) || 0; // 0이면 끝까지
let endReported = false;
const report = (s) => window.bridge && window.bridge.report(s);
let player = null;

const ERRORS = {
  2: '영상 주소가 올바르지 않습니다.',
  5: '이 영상은 앱에서 재생할 수 없습니다.',
  100: '영상을 찾을 수 없습니다. 삭제되었거나 비공개입니다.',
  101: '영상 주인이 다른 곳에서 재생하는 것을 막아 두었습니다. YouTube에서 직접 공유해 주세요.',
  150: '영상 주인이 다른 곳에서 재생하는 것을 막아 두었습니다. YouTube에서 직접 공유해 주세요.',
  153: '영상 재생 정보가 부족해 막혔습니다. (출처 오류)',
};

function showMessage(text) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.style.display = text ? 'flex' : 'none';
}

// YouTube 스크립트를 못 불러오면(인터넷 끊김 등) 알린다
const loadTimer = setTimeout(() => {
  if (!player) {
    showMessage('YouTube에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
    report({ state: 'error', message: 'YouTube에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.' });
  }
}, 15000);

window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player('player', {
    videoId,
    playerVars: { start: startSec, ...(endSec ? { end: endSec } : {}), rel: 0, playsinline: 1, origin: location.origin },
    events: {
      onReady: () => { clearTimeout(loadTimer); report({ state: 'ready', title: player.getVideoData().title }); },
      onStateChange: (e) => {
        const map = { [YT.PlayerState.PLAYING]: 'playing', [YT.PlayerState.PAUSED]: 'paused',
          [YT.PlayerState.ENDED]: 'ended', [YT.PlayerState.BUFFERING]: 'buffering' };
        if (e.data === YT.PlayerState.PLAYING) endReported = false;
        if (e.data === YT.PlayerState.ENDED && endReported) return;
        if (map[e.data]) report({ state: map[e.data] });
        if (e.data === YT.PlayerState.ENDED) showMessage('영상이 끝났습니다. 강의로 돌아가 주세요.');
        else if (e.data === YT.PlayerState.PLAYING) showMessage('');
      },
      onError: (e) => {
        const msg = ERRORS[e.data] || `재생 오류가 발생했습니다. (코드 ${e.data})`;
        showMessage(msg);
        report({ state: 'error', code: e.data, message: msg });
      },
    },
  });
};

// 종료 초가 정해져 있으면 그 시점에 멈추고 '끝남'으로 알린다
setInterval(() => {
  if (!endSec || endReported || !player || !player.getCurrentTime) return;
  if (player.getPlayerState() === YT.PlayerState.PLAYING && player.getCurrentTime() >= endSec) {
    endReported = true;
    player.pauseVideo();
    showMessage('영상이 끝났습니다. 강의로 돌아가 주세요.');
    report({ state: 'ended' });
  }
}, 250);

window.bridge && window.bridge.onCommand((cmd) => {
  if (!player || !player.playVideo) return;
  if (cmd === 'play') player.playVideo();
  else if (cmd === 'pause') player.pauseVideo();
  else if (cmd === 'restart') { player.seekTo(startSec, true); player.playVideo(); }
});
