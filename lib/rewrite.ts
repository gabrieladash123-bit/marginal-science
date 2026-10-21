import {clarityEdits,validateRewrite,wordCount} from './writing.ts';

const qualifiers=(text:string)=>text.toLowerCase().match(/\b(?:may|might|could|not|no|never|without)\b/g)??[];

export async function rewriteBySentence(text:string,generate:(sentence:string)=>Promise<string>,progress?:(index:number,total:number)=>void){
  const parts=Array.from(new Intl.Segmenter('en',{granularity:'sentence'}).segment(text),part=>part.segment);
  const candidates=new Set(parts.map((part,index)=>({index,words:wordCount(part),edits:clarityEdits(part).length})).filter(part=>part.words>=8&&part.words<=45).sort((a,b)=>b.edits-a.edits||b.words-a.words).slice(0,2).map(part=>part.index));
  let changed=0;let retained=0;let index=0;const total=parts.filter(part=>part.trim()).length;const output:string[]=[];
  for(const [partIndex,part] of parts.entries()){
    const sentence=part.trim();
    if(!sentence){output.push(part);continue;}
    progress?.(++index,total);
    if(!candidates.has(partIndex)){output.push(part);retained++;continue;}
    const draft=(await generate(sentence)).trim();
    if(draft!==sentence&&validateRewrite(sentence,draft)&&JSON.stringify(qualifiers(sentence))===JSON.stringify(qualifiers(draft))){
      output.push((part.match(/^\s*/)?.[0]??'')+draft+(part.match(/\s*$/)?.[0]??''));changed++;
    }else{output.push(part);retained++;}
  }
  const revised=output.join('');
  if(!validateRewrite(text,revised))throw new Error('The combined revision failed preservation checks.');
  return {text:revised,changed,retained};
}
