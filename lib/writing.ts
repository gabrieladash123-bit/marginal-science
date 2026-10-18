export type Edit={id:number;before:string;after:string;reason:string;start:number;end:number};
export const WORD_LIMIT=1200;
export const CHARACTER_LIMIT=18000;
export const wordCount=(text:string)=>(text.match(/\b[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*\b/gu)??[]).length;
export const sentences=(text:string)=>Array.from(new Intl.Segmenter('en',{granularity:'sentence'}).segment(text),part=>part.segment.trim()).filter(Boolean);

const rules:Array<[RegExp,string,string]>=[
  [/\bin order to\b/gi,'to','Use the shorter expression.'],
  [/\bdue to the fact that\b/gi,'because','State the relationship directly.'],
  [/\ba large number of\b/gi,'many','Replace an inflated quantity phrase.'],
  [/\bit is important to note that\s*/gi,'','Let the observation lead the sentence.'],
  [/\bhas the ability to\b/gi,'can','Use a direct verb.'],
  [/\bat this point in time\b/gi,'now','Remove unnecessary words.'],
  [/\bwith regard to\b/gi,'about','Use a familiar expression.'],
  [/\bin the event that\b/gi,'if','Simplify the condition.'],
  [/\ba total of\s*/gi,'','The quantity already communicates the total.'],
  [/\butilizes\b/gi,'uses','Prefer a familiar verb.'],
  [/\butilized\b/gi,'used','Prefer a familiar verb.'],
  [/\butilize\b/gi,'use','Prefer a familiar verb.'],
  [/\bfor the purpose of\b/gi,'for','Keep the purpose concise.'],
  [/\bprior to\b/gi,'before','Prefer a familiar expression.'],
  [/\bsubsequent to\b/gi,'after','Prefer a familiar expression.'],
];
const protectedPattern=/\[[^\]\n]{1,150}\]|\([^()\n]*\b(?:19|20)\d{2}[a-z]?[^()\n]*\)|https?:\/\/\S+|\$[^$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|[“"][^”"\n]+[”"]|\b(?:\d+(?:[.,]\d+)*)(?:\s?[%‰])?|\b[A-Z][A-Z0-9-]{1,}\b|[\u0370-\u03ff]+/g;
export function protectedValues(text:string){return [...text.matchAll(protectedPattern)].map(m=>m[0]);}
export function preservesProtectedValues(before:string,after:string){return JSON.stringify(protectedValues(before))===JSON.stringify(protectedValues(after));}
export function clarityEdits(text:string):Edit[]{
  const protectedRanges=[...text.matchAll(protectedPattern)].map(m=>({start:m.index!,end:m.index!+m[0].length}));
  const edits:Edit[]=[];
  for(const [pattern,replacement,reason] of rules) for(const match of text.matchAll(pattern)){
    const start=match.index!;const end=start+match[0].length;
    if(protectedRanges.some(range=>start<range.end&&end>range.start)||edits.some(edit=>start<edit.end&&end>edit.start))continue;
    const initial=/^[A-Z]/.test(match[0]);const after=initial&&replacement?replacement[0].toUpperCase()+replacement.slice(1):replacement;
    edits.push({id:start,before:match[0],after,reason,start,end});
  }
  return edits.sort((a,b)=>a.start-b.start);
}
export function applyEdits(text:string,edits:Edit[]){
  let revised=text;
  for(const edit of [...edits].sort((a,b)=>b.start-a.start)){
    if(text.slice(edit.start,edit.end)!==edit.before)throw new Error('The manuscript changed. Refresh the suggestions.');
    let replacement=edit.after;
    if(!replacement&&/^[A-Z]/.test(edit.before)){
      const next=revised.slice(edit.end).match(/^([a-z])/);
      if(next)revised=revised.slice(0,edit.end)+next[1].toUpperCase()+revised.slice(edit.end+1);
    }
    revised=revised.slice(0,edit.start)+replacement+revised.slice(edit.end);
  }
  if(!preservesProtectedValues(text,revised))throw new Error('A protected citation or quantity changed. The revision was blocked.');
  return revised;
}
export function writingStats(text:string){
  const parts=sentences(text);const words=wordCount(text);const lengths=parts.map(wordCount);
  return {words,sentences:parts.length,averageSentence:parts.length?words/parts.length:0,longSentences:parts.filter((_,i)=>lengths[i]>35),citations:(text.match(/\[[^\]\n]{1,150}\]|\([^()\n]*\b(?:19|20)\d{2}[a-z]?[^()\n]*\)/g)??[]).length,edits:clarityEdits(text)};
}
export function validateRewrite(original:string,revised:string){
  if(!revised.trim()||!preservesProtectedValues(original,revised))return false;
  const originalWords=new Set((original.toLowerCase().match(/[a-z]{4,}/g)??[]));
  const revisedWords=new Set((revised.toLowerCase().match(/[a-z]{4,}/g)??[]));
  const retained=[...originalWords].filter(word=>revisedWords.has(word)).length/(originalWords.size||1);
  return retained>=.65&&wordCount(revised)>=wordCount(original)*.65&&wordCount(revised)<=wordCount(original)*1.3;
}
