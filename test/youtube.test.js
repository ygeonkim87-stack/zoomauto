'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { extractVideoId, extractStartSeconds } = require('../src/shared/youtube');

const ID = 'dQw4w9WgXcQ';

test('일반·짧은·공유 URL에서 ID 추출', () => {
  for (const u of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abcDEF123&t=30`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?si=x`,
    `youtube.com/watch?v=${ID}`,
    `  ${ID}  `,
  ]) assert.strictEqual(extractVideoId(u), ID, u);
});

test('잘못된 입력은 null', () => {
  for (const u of ['', '   ', 'hello', 'https://example.com/watch?v=' + ID,
    'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/channel/abc', null])
    assert.strictEqual(extractVideoId(u), null, String(u));
});

test('시작 시간 추출', () => {
  assert.strictEqual(extractStartSeconds(`https://youtu.be/${ID}?t=90`), 90);
  assert.strictEqual(extractStartSeconds(`https://youtu.be/${ID}?t=1m30s`), 90);
  assert.strictEqual(extractStartSeconds(`https://youtu.be/${ID}`), 0);
});
