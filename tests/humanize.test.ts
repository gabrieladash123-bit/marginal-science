import test from 'node:test';
import assert from 'node:assert/strict';
import {humanizeText,validateHumanized} from '../lib/humanize.ts';
import {protectedValues} from '../lib/writing.ts';
import {exampleText} from '../src/examples.ts';

const source='In order to assess the stability of research findings, we compared estimates from 120 independent studies [1]. The method utilizes repeated sampling to identify patterns that remain consistent across groups. It is important to note that combining study-level estimates may improve interpretability without reducing uncertainty about individual findings. Further validation is required before the method can be used in clinical research.';

test('humanizing produces a reviewable draft with identical protected scientific content',()=>{
  const result=humanizeText(source);
  assert.notEqual(result.text,source);assert.equal(result.source,source);
  assert.match(result.text,/To assess/);assert.match(result.text,/method uses/);
  assert.match(result.text,/It is important to note that/);
  assert.match(result.text,/may improve/);assert.match(result.text,/without reducing uncertainty/);
  assert.deepEqual(protectedValues(result.text),protectedValues(source));
  assert.ok(validateHumanized(source,result.text));
});

test('concise style additionally removes framing while preserving scientific qualifiers',()=>{
  const natural=humanizeText(source,'natural');const concise=humanizeText(source,'concise');
  assert.ok(concise.revisedWords<natural.revisedWords);
  assert.doesNotMatch(concise.text,/It is important to note that/);
  assert.match(concise.text,/Combining study-level estimates may improve/);
  assert.ok(validateHumanized(source,concise.text));
});

test('protected text and paragraph boundaries remain unchanged across scientific fixtures',()=>{
  for(const protectedText of ['120 samples [1, 2]','5 mg (Smith et al., 2023)','α = 0.05 and IL-6','"in order to utilize"','$x^2 + y^2$','\\(x + y\\)','https://example.org/data?value=120']){
    const original=`The method utilizes repeated sampling to identify stable patterns across research groups using ${protectedText}.\n\nThese findings may improve interpretation without reducing uncertainty about individual results.`;
    for(const style of ['natural','concise'] as const){const result=humanizeText(original,style);assert.ok(result.changed);assert.deepEqual(protectedValues(result.text),protectedValues(original));assert.ok(result.text.includes('\n\n'));assert.ok(result.text.includes(protectedText));}
  }
});

test('unsafe model output cannot alter quantities, units, citations, negation or uncertainty',()=>{
  const original='The method utilizes 5 mg across 120 samples [1]. These results may improve interpretation without reducing uncertainty about individual findings.';
  for(const unsafe of [original.replace('5 mg','5 kg'),original.replace('120','150'),original.replace('[1]','[2]'),original.replace('may ','').replace('without','while'),original.replace('without','with'),original.split('. ')[0]+'.',original+' A new causal claim is supported.',''])assert.equal(validateHumanized(original,unsafe),false,unsafe);
  assert.equal(validateHumanized(original,original.replace('utilizes','uses')),true);
});

test('already direct language is returned unchanged rather than inventing edits',()=>{
  const direct='We compared estimates from independent studies. These findings may support further investigation.';
  assert.equal(humanizeText(direct).changed,false);assert.equal(humanizeText(direct).text,direct);
});

test('empty and oversized input and unsupported styles are rejected',()=>{
  assert.throws(()=>humanizeText(' \n '),/Paste text/);
  assert.throws(()=>humanizeText('study '.repeat(1201)),/1,200 words/);
  assert.throws(()=>humanizeText('x'.repeat(18001)),/18,000 characters/);
  assert.throws(()=>humanizeText(source,'invented' as any),/supported writing style/);
  assert.equal(humanizeText('study '.repeat(1200)).changed,false);
});

test('overaggressive shortening is rejected instead of removing most of a short draft',()=>{
  assert.throws(()=>humanizeText('It is important to note that results vary.','concise'),/preservation checks/);
});

test('both styles handle the built-in abstract and preserve a numeric sentence opener',()=>{
  for(const style of ['natural','concise'] as const){const result=humanizeText(exampleText,style);assert.ok(result.changed);assert.ok(validateHumanized(exampleText,result.text));assert.match(result.text,/A total of 240 paired observations/);}
});
