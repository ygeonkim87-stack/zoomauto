'use strict';

// YouTube URL에서 11자리 영상 ID를 뽑는다. 실패하면 null.
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function extractVideoId(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;
  if (ID_RE.test(text)) return text;

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  const parts = url.pathname.split('/').filter(Boolean);
  let id = null;

  if (host === 'youtu.be') {
    id = parts[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) id = parts[1];
    else if (parts.length === 0) id = url.searchParams.get('v');
  }

  return id && ID_RE.test(id) ? id : null;
}

// 공유 URL의 t=90, t=1m30s 같은 시작 시간을 초로 바꾼다.
function extractStartSeconds(input) {
  try {
    const text = input.trim();
    const url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
    const t = url.searchParams.get('t') || url.searchParams.get('start');
    if (!t) return 0;
    if (/^\d+$/.test(t)) return Number(t);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!m) return 0;
    return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
  } catch {
    return 0;
  }
}

module.exports = { extractVideoId, extractStartSeconds };
