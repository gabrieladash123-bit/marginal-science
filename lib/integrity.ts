import {wordCount} from './writing.ts';

export const INTEGRITY_VERSION='integrity-1';
const citationPattern=/\[[^\]\n]{1,150}\]|\([^()\n]*\b(?:19|20)\d{2}[a-z]?[^()\n]*\)/g;
const negation=/\b(?:not|never|no|without|neither|nor)\b/gi;
const uncertainty=/\b(?:may|might|could|possibly|perhaps|suggest(?:s|ed)?|appear(?:s|ed)?|potentially)\b/gi;
const causation=/\b(?:caus(?:e|es|ed)|led to|resulted in|prevents?)\b/i;
const association=/\b(?:associat(?:ed|ion)|correlat(?:ed|ion)|linked)\b/i;
const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const same=(a:string[],b:string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());

export function anchors(text:string){
  const citations=Array.from(text.matchAll(citationPattern),match=>match[0]);
  const unreferenced=text.replace(citationPattern,' ');
  const quantities=Array.from(unreferenced.matchAll(/(?<![\p{L}\p{N}_-])[<>≤≥=]?\s*[-+−]?\d+(?:[.,]\d+)*(?:\s?[eE][-+−]?\d+)?(?:\s?(?:%|‰|kg|mg|µg|μg|mL|mm|ms|hours?|days?|participants|samples|patients|studies)\b|%|‰)?/gu),match=>normalize(match[0]));
  return {citations,quantities,negation:Array.from(text.matchAll(negation),m=>m[0].toLowerCase()),uncertainty:Array.from(text.matchAll(uncertainty),m=>m[0].toLowerCase())};
}

export function claimSentences(text:string){
  if(text.length>18000)throw new Error('Notebook comparisons support at most 18,000 characters per draft.');
  const parts=Array.from(new Intl.Segmenter('en',{granularity:'sentence'}).segment(text),part=>part.segment.trim()).filter(Boolean);
  if(parts.length>120)throw new Error('Notebook comparisons support at most 120 sentences per draft.');
  return parts;
}

function similarity(a:string,b:string){
  const terms=(text:string)=>new Set(normalize(text).match(/[\p{L}\p{N}]+/gu)??[]);
  const left=terms(a),right=terms(b);const overlap=[...left].filter(term=>right.has(term)).length;
  return overlap/(new Set([...left,...right]).size||1);
}

export type Finding={kind:'quantity'|'citation'|'negation'|'uncertainty'|'causation'|'added'|'removed';message:string};
export type ClaimRow={id:string;before:string;after:string;originalIndex:number|null;currentIndex:number|null;status:'unchanged'|'modified'|'added'|'removed';moved:boolean;similarity:number;findings:Finding[]};

export function auditRevision(original:string,current:string){
  const left=claimSentences(original),right=claimSentences(current);
  const assigned=new Map<number,number>();const used=new Set<number>();
  left.forEach((sentence,index)=>{const match=right.findIndex((candidate,j)=>!used.has(j)&&normalize(candidate)===normalize(sentence));if(match>=0){assigned.set(index,match);used.add(match);}});
  const candidates=left.flatMap((sentence,i)=>assigned.has(i)?[]:right.flatMap((candidate,j)=>used.has(j)?[]:[{i,j,score:similarity(sentence,candidate)}])).filter(pair=>pair.score>=.38).sort((a,b)=>b.score-a.score||a.i-b.i||a.j-b.j);
  for(const pair of candidates)if(!assigned.has(pair.i)&&!used.has(pair.j)){assigned.set(pair.i,pair.j);used.add(pair.j);}
  const rows:ClaimRow[]=left.map((before,i)=>{
    const j=assigned.get(i);const after=j===undefined?'':right[j];const findings:Finding[]=[];
    if(j===undefined)findings.push({kind:'removed',message:'A baseline sentence is missing. Review any omitted evidence or limitation.'});
    else{
      const a=anchors(before),b=anchors(after);
      if(!same(a.quantities,b.quantities))findings.push({kind:'quantity',message:'A quantity, comparator, or unit changed.'});
      if(!same(a.citations,b.citations))findings.push({kind:'citation',message:'Citation text or references changed.'});
      if(!same(a.negation,b.negation))findings.push({kind:'negation',message:'Negation wording changed. Check the direction of the claim.'});
      if(a.uncertainty.length>b.uncertainty.length)findings.push({kind:'uncertainty',message:'An uncertainty marker was removed. Check the strength of the claim.'});
      if(association.test(before)&&!causation.test(before)&&causation.test(after))findings.push({kind:'causation',message:'Association wording became causal wording. Check whether the study supports causation.'});
    }
    return {id:`baseline-${i}`,before,after,originalIndex:i,currentIndex:j??null,status:j===undefined?'removed':before===after?'unchanged':'modified',moved:j!==undefined&&i!==j,similarity:j===undefined?0:similarity(before,after),findings};
  });
  right.forEach((after,j)=>{if(!used.has(j))rows.push({id:`added-${j}`,before:'',after,originalIndex:null,currentIndex:j,status:'added',moved:false,similarity:0,findings:[{kind:'added',message:'A new sentence has no matched baseline. Review its source and scientific meaning.'}]});});
  return {engine:INTEGRITY_VERSION,rows,summary:{baselineSentences:left.length,currentSentences:right.length,unchanged:rows.filter(row=>row.status==='unchanged').length,modified:rows.filter(row=>row.status==='modified').length,added:rows.filter(row=>row.status==='added').length,removed:rows.filter(row=>row.status==='removed').length,moved:rows.filter(row=>row.moved).length,flagged:rows.filter(row=>row.findings.length).length,findings:rows.reduce((sum,row)=>sum+row.findings.length,0),baselineWords:wordCount(original),currentWords:wordCount(current)}};
}
export type RevisionAudit=ReturnType<typeof auditRevision>;

export function wordDiff(before:string,after:string):Array<{kind:'same'|'removed'|'added';text:string}>{
  const a=before.match(/\s+|\S+/g)??[],b=after.match(/\s+|\S+/g)??[];
  if(a.length>600||b.length>600)return [{kind:'removed',text:before},{kind:'added',text:after}];
  const width=b.length+1,grid=new Uint16Array((a.length+1)*width);
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)grid[i*width+j]=a[i]===b[j]?1+grid[(i+1)*width+j+1]:Math.max(grid[(i+1)*width+j],grid[i*width+j+1]);
  const result:Array<{kind:'same'|'removed'|'added';text:string}>=[];let i=0,j=0;
  const add=(kind:'same'|'removed'|'added',text:string)=>{const last=result.at(-1);if(last?.kind===kind)last.text+=text;else result.push({kind,text});};
  while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){add('same',a[i++]);j++;}else if(i<a.length&&(j===b.length||grid[(i+1)*width+j]>=grid[i*width+j+1]))add('removed',a[i++]);else add('added',b[j++]);}
  return result;
}
