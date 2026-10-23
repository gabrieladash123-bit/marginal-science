import {applyEdits,CHARACTER_LIMIT,clarityEdits,protectedValues,sentences,validateRewrite,WORD_LIMIT,wordCount} from './writing.ts';
import {anchors} from './integrity.ts';

export type HumanizeStyle='natural'|'concise';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const markers=(text:string)=>text.toLowerCase().match(/\b(?:may|might|could|not|no|never|without|neither|nor|possibly|perhaps|suggest(?:s|ed)?|appear(?:s|ed)?|potentially)\b/g)??[];

export function humanizeInputError(text:string){
  if(!text.trim())return 'Paste text into the manuscript to humanize it.';
  if(text.length>CHARACTER_LIMIT||wordCount(text)>WORD_LIMIT)return 'Humanizing supports up to 1,200 words and 18,000 characters.';
  return '';
}

export function validateHumanized(original:string,revised:string){
  const a=anchors(original),b=anchors(revised);
  return validateRewrite(original,revised)&&same(a.quantities,b.quantities)&&same(markers(original),markers(revised))&&sentences(original).length===sentences(revised).length;
}

export function humanizeText(text:string,style:HumanizeStyle='natural'){
  const error=humanizeInputError(text);if(error)throw new Error(error);
  if(style!=='natural'&&style!=='concise')throw new Error('Choose a supported writing style.');
  const edits=clarityEdits(text).filter(edit=>(style==='concise'||edit.after.length>0)&&!(edit.after===''&&/^\d/.test(text.slice(edit.end))));
  const revised=applyEdits(text,edits);
  if(revised!==text&&!validateHumanized(text,revised))throw new Error('The draft did not pass the preservation checks. Use individual edits in Revision review.');
  return {source:text,text:revised,style,edits,changed:revised!==text,originalWords:wordCount(text),revisedWords:wordCount(revised),protectedSpans:protectedValues(text).length};
}
