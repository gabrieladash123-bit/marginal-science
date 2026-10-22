import {defineConfig,type ViteDevServer} from 'vite';
import {handleAnalysis} from './lib/service.ts';
import {handleRobustness} from './lib/robustness.ts';
import {GET as health} from './api/health.ts';
const localAnalysis=(server:Pick<ViteDevServer,'middlewares'>)=>{for(const [path,handler] of [['/api/analyze',handleAnalysis],['/api/robustness',handleRobustness],['/api/health',(request:Request)=>request.method==='GET'?health():Response.json({error:'Use GET for health.'},{status:405})]] as const)server.middlewares.use(path,async(req,res)=>{
    const chunks:Buffer[]=[];let length=0;
    try{for await(const chunk of req){length+=chunk.length;if(length>64000){res.statusCode=413;res.end(JSON.stringify({error:'The request is too large.'}));return;}chunks.push(Buffer.from(chunk));}
      const request=new Request('http://localhost'+path,{method:req.method,headers:{'Content-Type':String(req.headers['content-type']??'')},body:['GET','HEAD'].includes(req.method??'GET')?undefined:Buffer.concat(chunks).toString()});
      const response=await handler(request);res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));res.end(await response.text());
    }catch{res.statusCode=500;res.end(JSON.stringify({error:'The local analysis service is unavailable.'}));}
  });};
export default defineConfig({
  worker:{format:'es'},
  plugins:[{name:'local-analysis-api',configureServer:localAnalysis,configurePreviewServer:localAnalysis}],
  build:{target:'es2022',chunkSizeWarningLimit:1800},server:{port:5173,watch:{ignored:['**/artifacts/**','**/.python/**','**/.cache/**','**/.venv/**']}}
});
