export type DetectorModel = { schemaVersion:number; classes:string[]; vocabulary:Record<string,number>; idf:number[]; weights:number[][]; intercept:number[]; temperature:number };
export function tokenize(text:string):string[] {
  return text.normalize('NFKC').toLowerCase().replaceAll('’',"'").replace(/@math\d+/g,' ').match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}
export function predict(text:string, model:DetectorModel) {
  const tokens=tokenize(text); const counts=new Map<number,number>(); let known=0;
  const add=(term:string)=>{const index=model.vocabulary[term];if(Number.isInteger(index))counts.set(index,(counts.get(index)??0)+1);};
  tokens.forEach((token,i)=>{if(Number.isInteger(model.vocabulary[token]))known++;add(token);if(i) add(tokens[i-1]+' '+token);});
  const vector=[...counts].map(([index,count])=>({index,value:(1+Math.log(count))*model.idf[index]}));
  const norm=Math.sqrt(vector.reduce((sum,f)=>sum+f.value*f.value,0));
  vector.forEach(feature=>feature.value/=norm||1);
  const logits=model.intercept.map((bias,c)=>vector.reduce((sum,f)=>sum+model.weights[c][f.index]*f.value,bias)/model.temperature);
  const max=Math.max(...logits); const exponential=logits.map(x=>Math.exp(x-max)); const total=exponential.reduce((a,b)=>a+b,0);
  const probabilities=exponential.map(x=>x/total); const winner=probabilities.indexOf(Math.max(...probabilities));
  const terms=new Map(Object.entries(model.vocabulary).map(([term,index])=>[index,term]));
  const signals=vector.map(f=>({term:terms.get(f.index)!,contribution:f.value*(model.weights[winner][f.index]-(winner===0?(model.weights[1][f.index]+model.weights[2][f.index])/2:model.weights[0][f.index]))}))
    .filter(f=>f.contribution>0).sort((a,b)=>b.contribution-a.contribution).slice(0,7);
  const coverage=tokens.length?known/tokens.length:0;
  return {probabilities,winner,label:model.classes[winner],confidence:probabilities[winner],coverage,signals};
}
