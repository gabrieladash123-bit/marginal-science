import {analyze,handleTextRequest} from './service.ts';
import {claimSentences} from './integrity.ts';
import {sha256} from './review-bundle.ts';
import {wordCount} from './writing.ts';
import {distributionShift} from './distribution.ts';
export {distributionShift} from './distribution.ts';

export async function analyzeRobustness(input:unknown){
  const baseline=analyze(input);const text=(input as {text:string}).text;
  const sentences=claimSentences(text);
  const probes=[
    {id:'spacing',name:'Whitespace normalization',description:'Collapse repeated spaces and line breaks.',text:text.replace(/\s+/g,' ').trim()},
    {id:'unicode',name:'Unicode normalization',description:'Normalize compatibility characters to NFKC.',text:text.normalize('NFKC')},
    {id:'citations',name:'Citation ablation',description:'Remove bracketed and author-year references for diagnosis.',text:text.replace(/\[[^\]\n]{1,150}\]|\([^()\n]*\b(?:19|20)\d{2}[a-z]?[^()\n]*\)/g,' ')},
    {id:'order',name:'Sentence order reversal',description:'Reverse sentence order; discourse context changes.',text:[...sentences].reverse().join(' ')},
    {id:'opening',name:'Opening sentence ablation',description:'Omit the opening sentence; information is removed.',text:sentences.slice(1).join(' ')},
  ];
  const cases=probes.map(probe=>{
    if(wordCount(probe.text)<60)return {id:probe.id,name:probe.name,description:probe.description,status:'skipped' as const,reason:'Fewer than 60 words remain.'};
    if(probe.text.length>18000||wordCount(probe.text)>1200)return {id:probe.id,name:probe.name,description:probe.description,status:'skipped' as const,reason:'The transformed input exceeds analysis limits.'};
    const result=analyze({text:probe.text});
    return {id:probe.id,name:probe.name,description:probe.description,status:'measured' as const,changed:probe.text!==text,probabilities:result.probabilities,winner:result.winner,indeterminate:result.indeterminate,coverage:result.coverage,...distributionShift(baseline.probabilities,result.probabilities)};
  });
  const measured=cases.filter(item=>item.status==='measured');
  return {schema:'marginal-robustness-1',inputSha256:await sha256(text),model:baseline.model,baseline:{probabilities:baseline.probabilities,winner:baseline.winner,indeterminate:baseline.indeterminate},cases,summary:{measured:measured.length,skipped:cases.length-measured.length,labelChanges:measured.filter(item=>item.winner!==baseline.winner).length,decisionChanges:measured.filter(item=>item.winner!==baseline.winner||item.indeterminate!==baseline.indeterminate).length,maxProbabilityShift:Math.max(0,...measured.map(item=>item.maxProbabilityShift))},scope:'Diagnostic probes on the current draft, not an estimate of generalization. Order and omission probes change context or information.'};
}
export type RobustnessReport=Awaited<ReturnType<typeof analyzeRobustness>>;
export const handleRobustness=(request:Request)=>handleTextRequest(request,analyzeRobustness);
