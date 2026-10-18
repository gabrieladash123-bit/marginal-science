import report from '../ml/artifacts/report.json' with {type:'json'};
export function GET(){return Response.json({status:'ok',model:report.version,sha256:report.modelSha256,features:report.features},{headers:{'Cache-Control':'no-store'}});}
