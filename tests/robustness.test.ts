import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRobustness,distributionShift,handleRobustness} from '../lib/robustness.ts';
import {analyze} from '../lib/service.ts';
import {sha256} from '../lib/review-bundle.ts';
import {exampleText} from '../src/examples.ts';
import {verifyProbeReport} from '../lib/probe-report.ts';

test('robustness probes bind the exact manuscript and serving model',async()=>{
  const result=await analyzeRobustness({text:exampleText});const base=analyze({text:exampleText});
  assert.equal(result.inputSha256,await sha256(exampleText));assert.deepEqual(result.model,base.model);assert.deepEqual(result.baseline.probabilities,base.probabilities);assert.equal(result.cases.length,5);
  for(const item of result.cases)if(item.status==='measured'){
    assert.ok(item.probabilities.every(Number.isFinite));assert.ok(item.divergenceBits>=0&&item.divergenceBits<=1);assert.ok(item.maxProbabilityShift>=0&&item.maxProbabilityShift<=1);
    if(item.id==='spacing'||item.id==='unicode'){assert.equal(item.maxProbabilityShift,0);assert.equal(item.divergenceBits,0);}
  }
  assert.equal(result.summary.measured+result.summary.skipped,5);
});
test('short ablation probes are skipped instead of scored outside API bounds',async()=>{
  const result=await analyzeRobustness({text:'The observation '.repeat(35)+'.'});
  const opening=result.cases.find(item=>item.id==='opening');assert.equal(opening?.status,'skipped');
  await assert.rejects(()=>analyzeRobustness({text:'Too short.'}),/60/);
  await assert.rejects(()=>analyzeRobustness({text:12}),/text field/);
  await assert.rejects(()=>analyzeRobustness({text:'a '.repeat(1201)}),/1,200/);
});
test('distribution distances are symmetric, bounded and zero for identical probabilities across 500 cases',()=>{
  let state=82371;const next=()=>((state=(state*1664525+1013904223)>>>0)+1)/4294967297;
  const sample=()=>{const p=[next(),next(),next()];const sum=p.reduce((a,b)=>a+b,0);return p.map(value=>value/sum);};
  for(let i=0;i<500;i++){
    const a=sample(),b=sample(),ab=distributionShift(a,b),ba=distributionShift(b,a);
    assert.ok(Math.abs(ab.divergenceBits-ba.divergenceBits)<1e-12);assert.equal(ab.maxProbabilityShift,ba.maxProbabilityShift);assert.ok(ab.divergenceBits>=0&&ab.divergenceBits<=1);assert.equal(distributionShift(a,a).divergenceBits,0);
  }
  assert.equal(distributionShift([1,0,0],[0,1,0]).divergenceBits,1);
  for(const bad of [[NaN,0,1],[-1,1,1],[.1,.1,.1],[1,0]])assert.throws(()=>distributionShift(bad,[1,0,0]),/normalized/);
});
test('robustness HTTP endpoint bounds input, disables caching and avoids echoing raw text',async()=>{
  const request=(body:string,type='application/json')=>new Request('http://localhost/api/robustness',{method:'POST',headers:{'Content-Type':type},body});
  const response=await handleRobustness(request(JSON.stringify({text:exampleText})));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.doesNotMatch(await response.text(),/Scientific summaries support researchers/);
  assert.equal((await handleRobustness(new Request('http://localhost/api/robustness'))).status,405);
  assert.equal((await handleRobustness(request('text','text/plain'))).status,415);
  assert.equal((await handleRobustness(request('x'.repeat(64001)))).status,413);
  const malformed=await handleRobustness(request('{private manuscript'));assert.equal(malformed.status,422);assert.doesNotMatch(await malformed.text(),/private manuscript/);
});

test('client verification rejects stale source identity, wrong models and inconsistent measurements',async()=>{
  const result=await analyzeRobustness({text:exampleText});assert.deepEqual(await verifyProbeReport(result,exampleText),result);
  await assert.rejects(()=>verifyProbeReport(result,exampleText+' Changed.'));
  for(const mutate of [(r:typeof result)=>{r.model.sha256='a'.repeat(64);},(r:typeof result)=>{r.summary.measured++;},(r:typeof result)=>{r.baseline.winner=8;},(r:typeof result)=>{r.cases.reverse();},(r:typeof result)=>{const item=r.cases.find(x=>x.status==='measured');if(item?.status==='measured')item.maxProbabilityShift=.87;},(r:typeof result)=>{r.baseline.probabilities=[NaN,0,1];}]){
    const changed=structuredClone(result);mutate(changed);await assert.rejects(()=>verifyProbeReport(changed,exampleText));
  }
  for(const bad of [null,{},[],{schema:'marginal-robustness-1'}])await assert.rejects(()=>verifyProbeReport(bad,exampleText));
});
