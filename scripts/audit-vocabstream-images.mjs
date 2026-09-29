#!/usr/bin/env node
/** Local media/provenance checks; never downloads images or contacts license hosts. */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validWordImage, meaningChoices } from '../apps/vocabstream/src/lib/questionPolicy.ts';

const root = new URL('../public/vocabstream/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('images/manifest.json', root), 'utf8'));
const key = item => `${item.category}/${item.lessonNumber}/${item.word}`;
const records = new Map(manifest.images.map(item => [key(item), item]));
assert.equal(records.size, manifest.images.length, 'Duplicate image catalog identities.');
const used = new Set(), hashes = new Set(), identities = new Set();
let bytes = 0, supporting = 0;
const categories = {};
for (const directory of await readdir(new URL('data/', root), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const words = [];
  for (const name of await readdir(new URL(`data/${directory.name}/`, root))) {
    if (!/^Lesson\d+\.json$/.test(name)) continue;
    const lesson = JSON.parse(await readFile(new URL(`data/${directory.name}/${name}`, root), 'utf8'));
    words.push(...lesson.words.map(word => ({ ...word, lessonNumber: Number(name.match(/\d+/)[0]) })));
  }
  for (const word of words.filter(word => word.image)) {
    const id = key({ category: directory.name, lessonNumber: word.lessonNumber, word: word.word });
    assert(!identities.has(id), `${id}: duplicate illustrated identity.`);
    identities.add(id);
    assert(validWordImage(word.image), `${id}: invalid image metadata.`);
    assert.equal(meaningChoices(word, words).length, 3, `${id}: choices fail in full-course review.`);
    const record = records.get(id);
    assert(record, `${id}: missing image catalog record.`);
    assert.deepEqual(record.image, word.image, `${id}: lesson/provenance mismatch.`);
    assert.equal(record.role ?? 'meaning', word.imageRole ?? 'meaning', `${id}: role mismatch.`);
    categories[directory.name] = (categories[directory.name] ?? 0) + 1;
    if (word.imageRole === 'supporting') supporting++;
    const file = new URL(`../${word.image.src.slice(1)}`, root);
    const body = await readFile(file);
    const hash = createHash('sha256').update(body).digest('hex');
    assert.equal(record.sha256, hash, `${id}: artwork differs from recorded content hash.`);
    assert(body.byteLength <= 32_768, `${id}: oversized vocabulary image.`);
    const svg = body.toString('utf8');
    assert(svg.includes('<svg'), `${id}: expected SVG artwork.`);
    assert(!/<(?:script|foreignObject|image|iframe|use|style)\b|\bon\w+\s*=|(?:href|src)\s*=|url\s*\(|<!ENTITY|<!DOCTYPE/i.test(svg), `${id}: active or externally referenced SVG content.`);
    if (!used.has(word.image.src)) { bytes += body.byteLength; hashes.add(hash); }
    used.add(word.image.src);
  }
}
assert.equal(identities.size, records.size, 'Orphan image catalog records.');
const files = (await readdir(new URL('images/', root), { recursive: true })).filter(name => /\.(svg|png|webp|jpe?g)$/.test(name));
assert.deepEqual(new Set(files.map(name => `/vocabstream/images/${name}`)), used, 'Missing or unreferenced artwork.');
assert(used.size > 370 && hashes.size > 370, 'Expansion requires more than300 additional distinct artworks beyond the original70.');
console.log(JSON.stringify({ images: identities.size, uniqueFiles: used.size, uniqueHashes: hashes.size, bytes, categories, supporting, primaryMeaning: identities.size - supporting, errors: [] }, null, 2));
