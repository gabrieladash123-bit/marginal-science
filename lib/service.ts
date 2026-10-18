import artifact from '../ml/artifacts/detector.json' with {type:'json'};
import report from '../ml/artifacts/report.json' with {type:'json'};
import {predict,type DetectorModel} from './inference.ts';
import {writingStats,CHARACTER_LIMIT,WORD_LIMIT} from './writing.ts';

export function analyze(input:unknown){
  if(!input||typeof input!=='object'||typeof (input as {text?:unknown}).text!=='string')throw new Error('Provide a text field containing the abstract.');
  const text=(input as {text:string}).text;
  if(text.length>CHARACTER_LIMIT)throw new Error(`Use at most ${CHARACTER_LIMIT.toLocaleString()} characters.`);
  const stats=writingStats(text);
  if(stats.words<60||stats.words>WORD_LIMIT)throw new Error(`Use between 60 and ${WORD_LIMIT.toLocaleString()} words for analysis.`);
  const start=performance.now();const prediction=predict(text,artifact as DetectorModel);
  const confidenceThreshold=.65;
  return {...prediction,stats,indeterminate:prediction.confidence<confidenceThreshold||prediction.coverage<.55||stats.words<80,
    confidenceThreshold,elapsedMs:Math.round((performance.now()-start)*100)/100,model:{version:report.version,sha256:report.modelSha256},
    scope:stats.words>400?'Longer than most training abstracts. Interpret cautiously.':'English scientific abstracts; similarity to this dataset does not establish authorship.'};
}
export type Analysis=ReturnType<typeof analyze>;
export async function handleAnalysis(request:Request){
  if(request.method!=='POST')return Response.json({error:'Use POST for text analysis.'},{status:405,headers:{Allow:'POST'}});
  if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Send JSON with a text field.'},{status:415});
  const reader=request.body?.getReader();let bytes=0;let body='';const decoder=new TextDecoder();
  try{
    if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>64000){await reader.cancel();return Response.json({error:'The request is too large.'},{status:413});}body+=decoder.decode(value,{stream:true});}
    body+=decoder.decode();const result=analyze(JSON.parse(body));
    return Response.json(result,{headers:{'Cache-Control':'no-store','X-Model-Version':report.version}});
  }catch(error){
    const message=error instanceof SyntaxError?'The request must contain valid JSON.':error instanceof Error?error.message:'Analysis could not be completed.';
    return Response.json({error:message},{status:422,headers:{'Cache-Control':'no-store'}});
  }
}
