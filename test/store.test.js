'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { VideoStore, MAX_VIDEOS } = require('../src/main/store');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zoomauto-')), 'videos.json');
const URL = 'https://youtu.be/dQw4w9WgXcQ';

test('추가·저장·다시 불러오기', () => {
  const f = tmpFile();
  const s = new VideoStore(f);
  assert.ok(s.add({ title: '찬양 1', url: URL, start: '10', end: '' }).ok);
  const s2 = new VideoStore(f);
  assert.strictEqual(s2.list().length, 1);
  assert.strictEqual(s2.list()[0].start, 10);
  assert.strictEqual(s2.list()[0].end, null);
});

test('파일로 저장하고 불러오기, 이름 기억', () => {
  const s = new VideoStore(tmpFile());
  s.add({ title: 'A', url: URL, start: 5, end: 60, memo: 'm' });
  s.add({ title: 'B', url: URL });
  const out = path.join(path.dirname(tmpFile()), '2주차 수업.json');
  assert.strictEqual(s.exportTo(out).name, '2주차 수업');

  const f2 = tmpFile();
  const s2 = new VideoStore(f2);
  s2.add({ title: '지워질 영상', url: URL });
  const r = s2.importFrom(out);
  assert.ok(r.ok);
  assert.deepStrictEqual(s2.list().map((v) => v.title), ['A', 'B']);
  assert.strictEqual(s2.list()[0].end, 60);
  assert.strictEqual(new VideoStore(f2).name, '2주차 수업');
});

test('잘못된 파일은 불러오지 않고 목록 유지', () => {
  const s = new VideoStore(tmpFile());
  s.add({ title: 'keep', url: URL });
  const bad = path.join(path.dirname(tmpFile()), 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ videos: [{ title: 'x', url: 'https://example.com/video' }] }));
  assert.strictEqual(s.importFrom(bad).ok, false);
  fs.writeFileSync(bad, 'hello');
  assert.strictEqual(s.importFrom(bad).ok, false);
  assert.deepStrictEqual(s.list().map((v) => v.title), ['keep']);
});

test('개수 제한', () => {
  const s = new VideoStore(tmpFile());
  for (let i = 0; i < MAX_VIDEOS; i++) assert.ok(s.add({ title: 'v' + i, url: URL }).ok);
  const r = s.add({ title: 'over', url: URL });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(s.list().length, MAX_VIDEOS);
  assert.strictEqual(MAX_VIDEOS, 20);
});

test('검증: 잘못된 주소, 빈 이름, 종료<=시작', () => {
  const s = new VideoStore(tmpFile());
  assert.strictEqual(s.add({ title: 'a', url: 'hello' }).ok, false);
  assert.strictEqual(s.add({ title: '', url: URL }).ok, false);
  assert.strictEqual(s.add({ title: 'a', url: URL, start: 30, end: 20 }).ok, false);
});

test('수정·순서 바꾸기·삭제', () => {
  const s = new VideoStore(tmpFile());
  const a = s.add({ title: 'A', url: URL }).video;
  const b = s.add({ title: 'B', url: URL }).video;
  s.move(b.id, -1);
  assert.deepStrictEqual(s.list().map((v) => v.title), ['B', 'A']);
  s.update(a.id, { title: 'A2', url: URL, memo: '메모' });
  assert.strictEqual(s.get(a.id).title, 'A2');
  s.remove(b.id);
  assert.deepStrictEqual(s.list().map((v) => v.title), ['A2']);
});
