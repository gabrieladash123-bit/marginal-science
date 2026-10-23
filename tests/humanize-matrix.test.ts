import test from 'node:test';
import assert from 'node:assert/strict';
import {scientificTexts} from './fixtures/scientific-texts.ts';
import {humanizeText,validateHumanized} from '../lib/humanize.ts';
import {anchors} from '../lib/integrity.ts';
import {protectedValues,wordCount} from '../lib/writing.ts';

for(const fixture of scientificTexts)for(const style of ['natural','concise'] as const){
  test(`${fixture.id}: ${style} preserves scientific content or explicitly rejects the input`,()=>{
    if(fixture.expected[style]==='blocked'){assert.throws(()=>humanizeText(fixture.text,style),/preservation checks|Paste text|supports up to/);return;}
    const result=humanizeText(fixture.text,style);
    assert.equal(result.changed,fixture.expected[style]==='changed');assert.equal(result.source,fixture.text);
    assert.deepEqual(protectedValues(result.text),protectedValues(fixture.text));
    assert.deepEqual(anchors(result.text),anchors(fixture.text));
    assert.equal(validateHumanized(fixture.text,result.text),true);
    assert.deepEqual(result.text.match(/\r?\n\r?\n/g),fixture.text.match(/\r?\n\r?\n/g));
    assert.ok(result.revisedWords<=result.originalWords);
  });
}

test('the long-form fixture exercises exactly the supported word boundary',()=>{
  const fixture=scientificTexts.find(fixture=>fixture.id==='word-limit')!;
  assert.equal(wordCount(fixture.text),1200);assert.ok(fixture.text.length<=18000);
});
