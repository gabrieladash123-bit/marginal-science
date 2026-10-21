import assert from 'node:assert/strict';
import {analyze} from '../lib/service.ts';
import {exampleText} from '../src/examples.ts';
const base=(process.argv[2]??'https://marginal-science.vercel.app').replace(/\/$/,'');
const local=analyze({text:exampleText});
const healthResponse=await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(30000)});
assert.equal(healthResponse.status,200);
const health=await healthResponse.json();
assert.equal(health.sha256,local.model.sha256);
assert.equal(health.model,local.model.version);
const response=await fetch(`${base}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:exampleText}),signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200);
assert.equal(response.headers.get('cache-control'),'no-store');
const prediction=await response.json();
assert.deepEqual(prediction.model,local.model);
assert.equal(prediction.winner,local.winner);
assert.equal(prediction.indeterminate,local.indeterminate);
assert.equal(prediction.probabilities.length,local.probabilities.length);
prediction.probabilities.forEach((value,index)=>assert.ok(Math.abs(value-local.probabilities[index])<1e-9));
for(const [body,type,status] of [['{"text":','application/json',422],[JSON.stringify({text:'Too short.'}),'application/json',422],['plain text','text/plain',415],['x'.repeat(64001),'application/json',413]]){
  const rejected=await fetch(`${base}/api/analyze`,{method:'POST',headers:{'Content-Type':type},body,signal:AbortSignal.timeout(30000)});
  assert.equal(rejected.status,status);
  assert.equal(typeof (await rejected.json()).error,'string');
}
console.log(JSON.stringify({url:base,public:true,model:health.model,sha256:health.sha256,predictionParity:'VERIFIED',invalidRequests:'VERIFIED',inferenceMs:prediction.elapsedMs}));
