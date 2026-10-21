import {pipeline,env} from '@huggingface/transformers';
import {rewriteBySentence} from '../lib/rewrite.ts';
import {wordCount} from '../lib/writing.ts';
env.allowLocalModels=false;
env.backends.onnx.wasm!.numThreads=1;
let generator:((text:string,options:Record<string,unknown>)=>Promise<Array<{generated_text:string}>>)|undefined;
self.onmessage=async(event:MessageEvent<{text:string}>)=>{
  try{
    if(!generator)generator=await pipeline('text2text-generation','Xenova/LaMini-Flan-T5-77M',{
      dtype:'q8',device:'wasm',revision:'ac7ed8dcdab558daa9d648678e8545a919a81f85',
      progress_callback:(progress:unknown)=>self.postMessage({type:'progress',progress}),
    }) as unknown as typeof generator;
    const result=await rewriteBySentence(event.data.text,async sentence=>{
      const generated=await (generator as any)(`Paraphrase this sentence: ${sentence}`,{max_new_tokens:Math.min(110,Math.max(24,Math.ceil(wordCount(sentence)*1.6)+8)),do_sample:false,repetition_penalty:1.1});
      return generated[0].generated_text;
    },(index,total)=>self.postMessage({type:'working',index,total}));
    self.postMessage({type:'result',...result});
  }catch{self.postMessage({type:'error',message:'The local model could not load or finish. You can still use the clarity review.'});}
};
