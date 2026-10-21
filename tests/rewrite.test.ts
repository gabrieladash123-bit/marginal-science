import test from 'node:test';
import assert from 'node:assert/strict';
import {rewriteBySentence} from '../lib/rewrite.ts';

test('sentence rewriting retains rejected facts, uncertainty and paragraph boundaries',async()=>{
  const source='We compared estimates from 120 independent studies [1].\n\nThe method utilizes repeated sampling to identify stable patterns. These results may improve interpretation without reducing uncertainty.';
  const result=await rewriteBySentence(source,async sentence=>sentence.includes('120')?'We compared estimates from 150 independent studies [1].':sentence.includes('utilizes')?sentence.replace('utilizes','uses'):sentence.replace('may ','').replace('without','while'));
  assert.equal(result.text,'We compared estimates from 120 independent studies [1].\n\nThe method uses repeated sampling to identify stable patterns. These results may improve interpretation without reducing uncertainty.');
  assert.equal(result.changed,1);
  assert.equal(result.retained,2);
});

test('a summarizing model cannot remove manuscript sentences',async()=>{
  const source='The study compares multiple estimates across independent research groups. The analysis retains uncertainty about the interpretation of individual findings.';
  const result=await rewriteBySentence(source,async()=> 'Findings were compared.');
  assert.equal(result.text,source);
  assert.equal(result.changed,0);
});
