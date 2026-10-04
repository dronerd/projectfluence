import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(path.join(root, 'apps/vocabstream/audio-config.json'), 'utf8'));
const dataRoot = path.join(root, 'public/vocabstream/data');
const audioRoot = path.join(root, 'public/vocabstream/audio', config.version);
const version = `${config.version}|${config.model}|${config.voice}|${config.speed}|${config.instructions}|`;

function clipId(word, example) {
  let value = 0xcbf29ce484222325n;
  for (const byte of Buffer.from(`${version}${word.trim()}\0${example.trim()}`, 'utf8')) {
    value = ((value ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return value.toString(16).padStart(16, '0');
}

function validM4a(file) {
  let data;
  try { data = readFileSync(file); } catch { return false; }
  if (data.length < 1024) return false;
  let offset = 0;
  const boxes = new Set();
  while (offset + 8 <= data.length) {
    const size = data.readUInt32BE(offset);
    if (size < 8 || offset + size > data.length) return false;
    boxes.add(data.toString('ascii', offset + 4, offset + 8));
    offset += size;
  }
  return offset === data.length && ['ftyp', 'moov', 'mdat'].every(box => boxes.has(box));
}

const expected = new Map();
for (const category of readdirSync(dataRoot)) {
  const directory = path.join(dataRoot, category);
  if (!statSync(directory).isDirectory()) continue;
  for (const filename of readdirSync(directory).filter(name => /^Lesson\d+\.json$/.test(name))) {
    const lesson = JSON.parse(readFileSync(path.join(directory, filename), 'utf8'));
    for (const item of lesson.words ?? []) {
      const word = String(item.word ?? '').trim();
      const example = String(item.example ?? '').trim();
      if (!word) continue;
      const id = clipId(word, example);
      const old = expected.get(id);
      if (old && old !== `${word}\0${example}`) throw new Error(`Audio ID collision in ${category}/${filename}`);
      expected.set(id, `${word}\0${example}`);
    }
  }
}

const missing = [...expected.keys()].filter(id => !validM4a(path.join(audioRoot, `${id}.${config.extension}`)));
let sourceMp3s = 0;
try { sourceMp3s = readdirSync(audioRoot).filter(name => name.endsWith('.mp3')).length; } catch { /* All files will be reported missing. */ }
console.log(`${expected.size} unique readings; ${missing.length} missing or invalid ${config.extension} files; ${sourceMp3s} source MP3s`);
if (missing.length) console.error(`First missing IDs: ${missing.slice(0, 5).join(', ')}`);
if (missing.length || sourceMp3s) process.exitCode = 1;
