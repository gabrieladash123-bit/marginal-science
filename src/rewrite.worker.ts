import {pipeline,env} from '@huggingface/transformers';
env.allowLocalModels=false;
env.backends.onnx.wasm!.numThreads=1;
let generator:((text:string,options:Record<string,unknown>)=>Promise<Array<{generated_text:string}>>)|undefined;
self.onmessage=async(event:MessageEvent<{text:string}>)=>{
  try{
    if(!generator)generator=await pipeline('text2text-generation','Xenova/LaMini-Flan-T5-77M',{
      dtype:'q8',device:'wasm',revision:'ac7ed8dcdab558daa9d648678e8545a919a81f85',
      progress_callback:(progress:unknown)=>self.postMessage({type:'progress',progress}),
    }) as unknown as typeof generator;
    self.postMessage({type:'working'});
    const result=await (generator as any)(`Rewrite the following scientific paragraph for clarity. Preserve its meaning, uncertainty, numbers and citations. Return only the revised paragraph.\n\n${event.data.text}`,{max_new_tokens:320,do_sample:false,repetition_penalty:1.1});
    self.postMessage({type:'result',text:result[0].generated_text});
  }catch{self.postMessage({type:'error',message:'The local model could not load or finish. You can still use the clarity review.'});}
};
