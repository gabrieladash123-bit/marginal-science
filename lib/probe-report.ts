import model from '../ml/artifacts/report.json' with {type:'json'};
import type {RobustnessReport} from './robustness.ts';
import {distributionShift} from './distribution.ts';
import {sha256} from './review-bundle.ts';

export async function verifyProbeReport(value:unknown,text:string):Promise<RobustnessReport>{
  const p=value as RobustnessReport;
  const fail=()=>{throw new Error('The robustness result does not match this manuscript and model, or contains inconsistent measurements.');};
  if(!p||p.schema!=='marginal-robustness-1'||p.inputSha256!==await sha256(text)||p.model?.sha256!==model.modelSha256||p.model?.version!==model.version||!Array.isArray(p.cases)||p.cases.length!==5||!p.baseline||!p.summary)fail();
  const prediction=(item:{probabilities:number[];winner:number;indeterminate:boolean})=>{
    if(!Array.isArray(item.probabilities)||typeof item.indeterminate!=='boolean')fail();
    try{distributionShift(item.probabilities,item.probabilities);}catch{fail();}
    if(item.winner!==item.probabilities.indexOf(Math.max(...item.probabilities)))fail();
  };
  prediction(p.baseline);
  const expected=['spacing','unicode','citations','order','opening'];
  let measured=0,labelChanges=0,decisionChanges=0,maximum=0;
  for(const [index,item] of p.cases.entries()){
    if(!item||item.id!==expected[index]||typeof item.name!=='string'||item.name.length>100||typeof item.description!=='string'||item.description.length>300)fail();
    if(item.status==='skipped'){if(typeof item.reason!=='string'||item.reason.length>300)fail();continue;}
    if(item.status!=='measured'||typeof item.changed!=='boolean'||!Number.isFinite(item.coverage)||item.coverage<0||item.coverage>1)fail();
    prediction(item);const shift=distributionShift(p.baseline.probabilities,item.probabilities);
    if(!Number.isFinite(item.maxProbabilityShift)||!Number.isFinite(item.divergenceBits)||Math.abs(shift.maxProbabilityShift-item.maxProbabilityShift)>1e-8||Math.abs(shift.divergenceBits-item.divergenceBits)>1e-8)fail();
    measured++;if(item.winner!==p.baseline.winner)labelChanges++;
    if(item.winner!==p.baseline.winner||item.indeterminate!==p.baseline.indeterminate)decisionChanges++;
    maximum=Math.max(maximum,shift.maxProbabilityShift);
  }
  if(p.summary.measured!==measured||p.summary.skipped!==5-measured||p.summary.labelChanges!==labelChanges||p.summary.decisionChanges!==decisionChanges||!Number.isFinite(p.summary.maxProbabilityShift)||Math.abs(p.summary.maxProbabilityShift-maximum)>1e-8)fail();
  return p;
}
