import report from '../ml/artifacts/report.json' with {type:'json'};
import {auditRevision,INTEGRITY_VERSION} from './integrity.ts';

export function canonical(value:unknown,depth=0):string{
  if(depth>24)throw new Error('The review record is nested too deeply.');
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(item=>canonical(item,depth+1)).join(',')+']';
  if(typeof value==='object'&&value!==null)return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key],depth+1)).join(',')+'}';
  throw new Error('The review record contains an unsupported value.');
}
export async function sha256(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');}

export async function createReviewBundle(title:string,baseline:{label:string;text:string},manuscript:string){
  if(title.length>140||baseline.label.length>60)throw new Error('Shorten the title or checkpoint label before exporting.');
  const payload={schema:'marginal-review-1',engine:INTEGRITY_VERSION,createdAt:new Date().toISOString(),title,baseline,manuscript,model:{version:report.version,sha256:report.modelSha256},audit:auditRevision(baseline.text,manuscript)};
  return {payload,sha256:await sha256(canonical(payload)),signed:false};
}
export type ReviewBundle=Awaited<ReturnType<typeof createReviewBundle>>;

export async function verifyReviewBundle(serialized:string):Promise<ReviewBundle>{
  if(new TextEncoder().encode(serialized).byteLength>512000)throw new Error('Review files must be smaller than 512 KB.');
  let bundle:ReviewBundle;
  try{bundle=JSON.parse(serialized);}catch{throw new Error('Choose a valid JSON review file.');}
  const p=bundle?.payload;
  if(!p||p.schema!=='marginal-review-1'||p.engine!==INTEGRITY_VERSION||bundle.signed!==false)throw new Error('Unsupported review record version.');
  if(typeof p.title!=='string'||p.title.length>140||!p.baseline||typeof p.baseline.label!=='string'||p.baseline.label.length>60||typeof p.baseline.text!=='string'||typeof p.manuscript!=='string'||typeof p.createdAt!=='string'||!Number.isFinite(Date.parse(p.createdAt)))throw new Error('The review record has invalid manuscript fields.');
  if(p.model?.version!==report.version||p.model?.sha256!==report.modelSha256)throw new Error('This record uses a different classifier. Its model identity cannot be verified here.');
  if(typeof bundle.sha256!=='string'||!/^[a-f0-9]{64}$/.test(bundle.sha256)||await sha256(canonical(p))!==bundle.sha256)throw new Error('The review checksum does not match its contents.');
  if(canonical(auditRevision(p.baseline.text,p.manuscript))!==canonical(p.audit))throw new Error('The stored audit does not match the manuscript comparison.');
  return bundle;
}
