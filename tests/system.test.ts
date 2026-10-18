import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {predict,type DetectorModel} from '../lib/inference.ts';
import {applyEdits,clarityEdits,preservesProtectedValues,protectedValues,validateRewrite} from '../lib/writing.ts';
import {analyze,handleAnalysis} from '../lib/service.ts';
import {exampleText} from '../src/examples.ts';
const read=(name:string)=>JSON.parse(readFileSync(new URL('../ml/artifacts/'+name,import.meta.url),'utf8'));
const model:DetectorModel=read('detector.json');const report=read('report.json');

test('portable predictions match Python/scikit-learn across normalization edge cases',()=>{
  for(const fixture of read('parity.json')){
    const result=predict(fixture.text,model);
    result.probabilities.forEach((value,index)=>assert.ok(Math.abs(value-fixture.probabilities[index])<1e-9));
    assert.ok(Math.abs(result.probabilities.reduce((a,b)=>a+b,0)-1)<1e-12);
  }
});
test('report binds the exact serving artifact and all evaluation samples',()=>{
  const bytes=readFileSync(new URL('../ml/artifacts/detector.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),report.modelSha256);
  assert.equal(report.checks.paperOverlap,0);assert.equal(report.checks.exactTextOverlap,0);
  assert.equal(report.test.confusion.flat().reduce((a:number,b:number)=>a+b,0),report.split.test.samples);
  assert.equal(report.split.train.samples+report.split.validation.samples+report.split.test.samples,report.dataset.samples);
});
test('clarity edits preserve scientific quantities, citations, quotations, and notation',()=>{
  const original='In order to assess IL-6, we utilized 240 samples [1, 2] and α = 0.05. "In order to" is quoted. Prior to analysis, $x^2$ was fixed (Smith et al., 2023).';
  const edits=clarityEdits(original);const revised=applyEdits(original,edits);
  assert.match(revised,/To assess IL-6, we used 240 samples/);
  assert.match(revised,/"In order to" is quoted/);
  assert.deepEqual(protectedValues(original),protectedValues(revised));
  assert.ok(preservesProtectedValues(original,revised));
});
test('individually selected revisions do not apply unselected changes',()=>{
  const original='We utilize paired observations in order to test the hypothesis.';
  const edits=clarityEdits(original);const revised=applyEdits(original,[edits[0]]);
  assert.equal(revised,'We use paired observations in order to test the hypothesis.');
});
test('stale edits refuse to overwrite a changed manuscript',()=>{
  const original='We utilize a model.';const edits=clarityEdits(original);
  assert.throws(()=>applyEdits('We employ a model.',edits),/manuscript changed/);
});
test('model drafts changing a number, citation, quotation or notation are rejected',()=>{
  const original='We examined 240 observations [1], used IL-6, and retained α = 0.05 to assess the stated hypothesis.';
  for(const changed of [original.replace('240','250'),original.replace('[1]','[2]'),original.replace('IL-6','IL-8'),original.replace('α','β')])assert.equal(validateRewrite(original,changed),false);
  assert.equal(validateRewrite(original,'A generic result.'),false);
  assert.equal(validateRewrite(original,original),true);
});
test('removing a stock opener produces an intact sentence',()=>{
  const original='It is important to note that the association may be uncertain.';
  assert.equal(applyEdits(original,clarityEdits(original)),'The association may be uncertain.');
});
test('unknown vocabulary yields finite probabilities and zero coverage',()=>{
  const result=predict('zxqwv jxqvv qzzjv',model);
  assert.ok(result.probabilities.every(Number.isFinite));assert.equal(result.coverage,0);
});
test('short and invalid analysis inputs fail before classification',()=>{
  assert.throws(()=>analyze({text:'A short sentence.'}),/60/);
  assert.throws(()=>analyze({text:3}),/text field/);
  assert.throws(()=>analyze({text:'a'.repeat(18001)}),/18,000/);
  assert.equal(analyze({text:('zxqwv jxqvv qzzjv ').repeat(30)}).indeterminate,true);
});
test('HTTP endpoint handles valid analysis, invalid JSON, methods, media type, and body bounds',async()=>{
  const response=await handleAnalysis(new Request('http://localhost/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:exampleText})}));
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const body=await response.json();assert.equal(body.probabilities.length,3);assert.equal(body.model.sha256,report.modelSha256);
  assert.equal((await handleAnalysis(new Request('http://localhost/api/analyze'))).status,405);
  assert.equal((await handleAnalysis(new Request('http://localhost/api/analyze',{method:'POST',body:'text'}))).status,415);
  const malformed=await handleAnalysis(new Request('http://localhost/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:'{private malformed text'}));
  assert.equal(malformed.status,422);assert.doesNotMatch(await malformed.text(),/private malformed/);
  const oversized=await handleAnalysis(new Request('http://localhost/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(65000)}));
  assert.equal(oversized.status,413);
});
