import {defineConfig} from 'vite';
import {handleAnalysis} from './lib/service.ts';
export default defineConfig({
  worker:{format:'es'},
  plugins:[{name:'local-analysis-api',configureServer(server){server.middlewares.use('/api/analyze',async(req,res)=>{
    const chunks:Buffer[]=[];let length=0;
    try{for await(const chunk of req){length+=chunk.length;if(length>64000){res.statusCode=413;res.end(JSON.stringify({error:'The request is too large.'}));return;}chunks.push(Buffer.from(chunk));}
      const request=new Request('http://localhost/api/analyze',{method:req.method,headers:{'Content-Type':String(req.headers['content-type']??'')},body:Buffer.concat(chunks).toString()});
      const response=await handleAnalysis(request);res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));res.end(await response.text());
    }catch{res.statusCode=500;res.end(JSON.stringify({error:'The local analysis service is unavailable.'}));}
  });}}],
  build:{target:'es2022',chunkSizeWarningLimit:1800},server:{port:5173}
});
