import test from 'node:test';
import assert from 'node:assert/strict';
import {anchors,auditRevision,claimSentences,wordDiff} from '../lib/integrity.ts';
import {canonical,createReviewBundle,sha256,verifyReviewBundle} from '../lib/review-bundle.ts';
import {reviewExampleOriginal,reviewExampleRevised} from '../src/notebook-example.ts';

test('review example flags altered quantity, negation, uncertainty and causal upgrade',()=>{
  const audit=auditRevision(reviewExampleOriginal,reviewExampleRevised);
  const kinds=audit.rows.flatMap(row=>row.findings.map(finding=>finding.kind));
  for(const kind of ['quantity','negation','uncertainty','causation'])assert.ok(kinds.includes(kind as typeof kinds[number]),kind);
  assert.equal(audit.summary.added,0);assert.equal(audit.summary.removed,0);
});
test('unchanged drafts and sentence moves retain each claim exactly once',()=>{
  const source='We sampled 120 participants [1]. Follow-up continued for 90 days. These results may indicate an association.';
  assert.equal(auditRevision(source,source).summary.findings,0);
  const moved=auditRevision(source,'These results may indicate an association. We sampled 120 participants [1]. Follow-up continued for 90 days.');
  assert.equal(moved.summary.findings,0);assert.equal(moved.summary.moved,3);assert.equal(moved.summary.unchanged,3);
});
test('citation loss and duplicated quantities are detected without counting citation IDs as quantities',()=>{
  const before='We sampled 120 participants [1, 2] and monitored IL-6 at 0.5 mg (Smith, 2023).';
  assert.deepEqual(anchors(before).quantities,['120 participants','0.5 mg']);
  const audit=auditRevision(before,before.replace('[1, 2]','[2]').replace('0.5 mg','0.5 mg and 0.5 mg'));
  assert.deepEqual(audit.rows[0].findings.map(finding=>finding.kind),['quantity','citation']);
});
test('scientific notation, inequality direction and units survive extraction and comparison',()=>{
  const before='We estimated p < 1e-3 using 20 samples at 5 mg.';
  const audit=auditRevision(before,before.replace('<','>').replace('mg','kg'));
  assert.ok(audit.rows[0].findings.some(finding=>finding.kind==='quantity'));
  assert.ok(anchors(before).quantities.some(value=>value.includes('1e-3')));
});
test('added, removed and duplicated sentences cannot silently disappear from the ledger',()=>{
  const a='The assay measured protein concentration in plasma. Independent observations supported the proposed mechanism.';
  const b='The assay measured protein concentration in plasma. The assay measured protein concentration in plasma. Astronomical observations revealed distant planetary systems.';
  const audit=auditRevision(a,b);
  assert.equal(audit.summary.added,2);assert.equal(audit.summary.removed,1);
  assert.equal(audit.rows.filter(row=>row.currentIndex!==null).length,3);
  assert.equal(new Set(audit.rows.filter(row=>row.currentIndex!==null).map(row=>row.currentIndex)).size,3);
});
test('uncertainty synonyms remain while dropped negation gets a review flag',()=>{
  const before='The results may indicate that treatment does not improve recovery.';
  const synonym=auditRevision(before,before.replace('may','might'));
  assert.equal(synonym.summary.findings,0);
  assert.ok(auditRevision(before,before.replace('not ','')).rows[0].findings.some(finding=>finding.kind==='negation'));
});
test('word diffs reconstruct both drafts including punctuation, whitespace and Unicode',()=>{
  for(const [before,after] of [['We utilized α = 0.05 [1].','We used α = 0.05 [1].'],['  A\nnew finding.','A new finding!'],['','Added claim.'],['Removed claim.',''],['x '.repeat(400),'y '.repeat(400)]]){
    const diff=wordDiff(before,after);
    assert.equal(diff.filter(part=>part.kind!=='added').map(part=>part.text).join(''),before);
    assert.equal(diff.filter(part=>part.kind!=='removed').map(part=>part.text).join(''),after);
  }
});
test('comparison bounds reject expensive or oversized manuscripts explicitly',()=>{
  assert.throws(()=>claimSentences('x'.repeat(18001)),/18,000/);
  assert.throws(()=>claimSentences('One sentence. '.repeat(121)),/120 sentences/);
  assert.equal(claimSentences('One sentence. '.repeat(120)).length,120);
});
test('review bundle round-trips with model identity and a recomputed audit',async()=>{
  const bundle=await createReviewBundle('Illustrative case',{label:'Before edit',text:reviewExampleOriginal},reviewExampleRevised);
  assert.equal(bundle.signed,false);assert.match(bundle.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(await verifyReviewBundle(JSON.stringify(bundle)),bundle);
});
test('tampered manuscript, checksum, model identity and forged audit are rejected',async()=>{
  const original=await createReviewBundle('Review',{label:'Baseline',text:reviewExampleOriginal},reviewExampleRevised);
  const changed=structuredClone(original);changed.payload.manuscript+=' Another claim.';
  await assert.rejects(()=>verifyReviewBundle(JSON.stringify(changed)),/checksum/);
  const badHash=structuredClone(original);badHash.sha256='a'.repeat(64);await assert.rejects(()=>verifyReviewBundle(JSON.stringify(badHash)),/checksum/);
  const badModel=structuredClone(original);badModel.payload.model.sha256='a'.repeat(64);await assert.rejects(()=>verifyReviewBundle(JSON.stringify(badModel)),/model identity/);
  const forged=structuredClone(original);forged.payload.audit.summary.findings=0;forged.sha256=await sha256(canonical(forged.payload));await assert.rejects(()=>verifyReviewBundle(JSON.stringify(forged)),/stored audit/);
});
test('unsupported, malformed, oversized and deeply nested review records fail safely',async()=>{
  for(const text of ['null','{}','[]','{bad','x'.repeat(512001)])await assert.rejects(()=>verifyReviewBundle(text));
  const bundle=await createReviewBundle('Review',{label:'Baseline',text:reviewExampleOriginal},reviewExampleRevised);bundle.payload.schema='future';await assert.rejects(()=>verifyReviewBundle(JSON.stringify(bundle)),/version/);
  let nested:unknown=0;for(let i=0;i<30;i++)nested=[nested];assert.throws(()=>canonical(nested),/deeply/);
  assert.throws(()=>canonical({value:NaN}),/unsupported/);
  assert.equal(canonical({z:1,a:{b:2}}),canonical({a:{b:2},z:1}));
});
