import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseManifest} from './worker.ts';
import {evaluateEditorialReview} from './policy.ts';
test('committed catalog has unique IDs, supported evidence and no copied provider payloads',async()=>{
  const raw=JSON.parse(await readFile(new URL('../../../catalog/reviews.json',import.meta.url),'utf8'));
  const manifest=parseManifest(raw);
  assert.ok(manifest.reviews.length>0);
  for(const input of manifest.reviews){
    const result=evaluateEditorialReview(input);
    assert.equal(result.decision,'approve',JSON.stringify(result.reasons));
    assert.ok(result.editorial?.evidence.sourceUrl);
    assert.equal(result.editorial?.audioReview,null,'Source-based reviews must not claim unobserved listening.');
    for(const key of ['title','description','thumbnail_url','statistics','transcript'])assert.equal(key in (input as object),false,`Copied provider payload: ${key}`);
  }
});
