import {validateRewrite,wordCount} from './writing.ts';

const qualifiers=(text:string)=>text.toLowerCase().match(/\b(?:may|might|could|not|no|never|without)\b/g)??[];

export async function rewriteBySentence(text:string,generate:(sentence:string)=>Promise<string>,progress?:(index:number,total:number)=>void){
  const parts=Array.from(new Intl.Segmenter('en',{granularity:'sentence'}).segment(text),part=>part.segment);
  let changed=0;let retained=0;let index=0;const total=parts.filter(part=>part.trim()).length;const output:string[]=[];
  for(const part of parts){
    const sentence=part.trim();
    if(!sentence){output.push(part);continue;}
    progress?.(++index,total);
    if(wordCount(sentence)<8){output.push(part);retained++;continue;}
    const draft=(await generate(sentence)).trim();
    if(draft!==sentence&&validateRewrite(sentence,draft)&&JSON.stringify(qualifiers(sentence))===JSON.stringify(qualifiers(draft))){
      output.push((part.match(/^\s*/)?.[0]??'')+draft+(part.match(/\s*$/)?.[0]??''));changed++;
    }else{output.push(part);retained++;}
  }
  const revised=output.join('');
  if(!validateRewrite(text,revised))throw new Error('The combined revision failed preservation checks.');
  return {text:revised,changed,retained};
}
