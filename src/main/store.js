'use strict';
const fs = require('fs');
const path = require('path');
const { extractVideoId } = require('../shared/youtube');

const MAX_VIDEOS = 10;

// 영상 목록을 JSON 파일 하나에 저장한다 ({ videos: [{ id, title, url, start, end, memo }] })
class VideoStore {
  constructor(file) {
    this.file = file;
    this.videos = [];
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.videos = Array.isArray(data.videos) ? data.videos.slice(0, MAX_VIDEOS) : [];
    } catch {
      this.videos = [];
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ videos: this.videos }, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  list() { return this.videos; }

  // 입력값을 검사해 저장 가능한 영상 항목으로 바꾼다. 오류면 { error }
  static normalize(input) {
    const url = String(input.url || '').trim();
    if (!extractVideoId(url)) return { error: '올바른 YouTube 주소가 아닙니다.' };
    const title = String(input.title || '').trim();
    if (!title) return { error: '영상 이름을 입력해 주세요.' };
    const toSec = (v) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : NaN;
    };
    const start = toSec(input.start);
    const end = toSec(input.end);
    if (Number.isNaN(start) || Number.isNaN(end)) return { error: '시작/종료 초는 0 이상의 숫자로 입력해 주세요.' };
    if (start !== null && end !== null && end <= start) return { error: '종료 초는 시작 초보다 커야 합니다.' };
    return { title: title.slice(0, 60), url, start, end, memo: String(input.memo || '').trim().slice(0, 200) };
  }

  add(input) {
    if (this.videos.length >= MAX_VIDEOS) return { ok: false, error: `영상은 ${MAX_VIDEOS}개까지 등록할 수 있습니다.` };
    const v = VideoStore.normalize(input);
    if (v.error) return { ok: false, error: v.error };
    v.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.videos.push(v);
    this.save();
    return { ok: true, video: v };
  }

  update(id, input) {
    const i = this.videos.findIndex((v) => v.id === id);
    if (i < 0) return { ok: false, error: '영상을 찾을 수 없습니다.' };
    const v = VideoStore.normalize(input);
    if (v.error) return { ok: false, error: v.error };
    this.videos[i] = { ...v, id };
    this.save();
    return { ok: true, video: this.videos[i] };
  }

  remove(id) {
    this.videos = this.videos.filter((v) => v.id !== id);
    this.save();
    return { ok: true };
  }

  move(id, delta) {
    const i = this.videos.findIndex((v) => v.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.videos.length) return { ok: false };
    [this.videos[i], this.videos[j]] = [this.videos[j], this.videos[i]];
    this.save();
    return { ok: true };
  }

  get(id) { return this.videos.find((v) => v.id === id) || null; }
}

module.exports = { VideoStore, MAX_VIDEOS };
