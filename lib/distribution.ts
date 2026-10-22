export function distributionShift(a:number[],b:number[]){
  const valid=(p:number[])=>p.length===3&&p.every(value=>Number.isFinite(value)&&value>=0&&value<=1)&&Math.abs(p.reduce((sum,value)=>sum+value,0)-1)<1e-8;
  if(!valid(a)||!valid(b))throw new Error('Expected normalized three-class probabilities.');
  const middle=a.map((value,i)=>(value+b[i])/2);
  const kl=(p:number[])=>p.reduce((sum,value,i)=>sum+(value?value*Math.log2(value/middle[i]):0),0);
  return {divergenceBits:Math.max(0,(kl(a)+kl(b))/2),maxProbabilityShift:Math.max(...a.map((value,i)=>Math.abs(value-b[i])))};
}
