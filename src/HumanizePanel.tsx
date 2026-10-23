import {useEffect,useRef,useState} from 'react';
import {ArrowLineDown,Check,CheckCircle,Clipboard,ShieldCheck,Sparkle,WarningCircle,X} from '@phosphor-icons/react';
import {humanizeInputError,humanizeText,validateHumanized,type HumanizeStyle} from '../lib/humanize.ts';
import {wordDiff} from '../lib/integrity.ts';
import {protectedValues,wordCount} from '../lib/writing.ts';
import './humanize.css';

type Draft={source:string;text:string;method:'phrases'|'model';changes:number};
export default function HumanizePanel({text,onApply}:{text:string;onApply:(value:string)=>void}){
  const [style,setStyle]=useState<HumanizeStyle>('natural');
  const [draft,setDraft]=useState<Draft|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');const [copied,setCopied]=useState(false);
  const worker=useRef<Worker|null>(null);const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const copyTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const current=useRef(text);current.current=text;
  const request=useRef(0);const preview=useRef<HTMLHeadingElement>(null);
  function stop(){request.current++;worker.current?.terminate();worker.current=null;clearTimeout(timer.current);}
  useEffect(()=>{setDraft(null);setError('');setNotice('');setBusy(false);setCopied(false);clearTimeout(copyTimer.current);return()=>{stop();clearTimeout(copyTimer.current);};},[text]);
  const inputError=humanizeInputError(text);const visibleDraft=draft?.source===text?draft:null;
  function prepare(){
    stop();setBusy(false);setError('');setNotice('');setCopied(false);setDraft(null);
    try{const result=humanizeText(text,style);if(!result.changed){setNotice('No matching phrases need changing. Try the local model for sentence-level alternatives, or keep your current wording.');return;}setDraft({source:text,text:result.text,method:'phrases',changes:result.edits.length});}
    catch(reason){setError(reason instanceof Error?reason.message:'The draft could not be prepared.');}
  }
  function startModel(){
    if(inputError){setError(inputError);return;}
    if(wordCount(text)>220){setError('The local model supports up to 220 words. The instant phrase pass supports up to 1,200 words.');return;}
    stop();const id=++request.current;const source=text;setBusy(true);setProgress('Preparing local model download');setError('');setNotice('');setDraft(null);setCopied(false);
    let instance:Worker;
    try{instance=new Worker(new URL('./rewrite.worker.ts',import.meta.url),{type:'module'});worker.current=instance;}
    catch{setBusy(false);setError('The local model could not start. Use the instant phrase pass above.');return;}
    const active=()=>id===request.current&&current.current===source;
    const fail=(message:string)=>{if(!active())return;stop();setBusy(false);setError(message);};
    timer.current=setTimeout(()=>fail('The model took too long to download or run. Retry, or use the instant phrase pass.'),300000);
    instance.onerror=()=>fail('The local model could not start. Use the instant phrase pass above.');
    instance.onmessage=event=>{
      if(!active())return;const data=event.data;
      if(data.type==='progress')setProgress(data.progress.status==='progress'?`Downloading model: ${Math.round(data.progress.progress??0)}%`:'Preparing local model');
      if(data.type==='working')setProgress(`Reviewing sentence ${data.index} of ${data.total} on your device`);
      if(data.type==='error')fail(data.message);
      if(data.type==='result'){
        stop();setBusy(false);
        if(typeof data.text!=='string'||!validateHumanized(source,data.text)){setError('The model draft changed protected content, qualifiers, or sentence structure. It was blocked. Try the instant phrase pass.');return;}
        if(data.text===source){setNotice('No model edits passed the checks. Your manuscript is unchanged.');return;}
        setDraft({source,text:data.text,method:'model',changes:data.changed});
      }
    };instance.postMessage({text:source});
  }
  useEffect(()=>{if(visibleDraft)preview.current?.focus({preventScroll:true});},[draft]);
  async function copy(){if(!visibleDraft)return;try{await navigator.clipboard.writeText(visibleDraft.text);setCopied(true);clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),1800);}catch{setError('Clipboard access is unavailable. Download the draft or select its text to copy.');}}
  function download(){if(!visibleDraft)return;const url=URL.createObjectURL(new Blob([visibleDraft.text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='marginal-humanized-draft.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="humanize-panel" aria-label="Text humanizer">
    <div className="panel-heading"><Sparkle size={18}/><span>Humanize your scientific writing</span></div>
    <h2 className="review-heading">Clearer language. Your meaning.</h2><p className="panel-description">Make formal phrasing more natural, then review every change before replacing your manuscript.</p>
    <fieldset className="humanize-styles"><legend>Writing style</legend>{([['natural','Natural academic','Use familiar verbs and direct phrases.'],['concise','Concise academic','Also remove matched framing and filler.']] as const).map(([value,label,description])=><label key={value}><input type="radio" name="humanize-style" value={value} checked={style===value} onChange={()=>{stop();setBusy(false);setStyle(value);setDraft(null);setError('');setNotice('');setCopied(false);}}/><span><strong>{label}</strong><small>{description}</small></span></label>)}</fieldset>
    <button className="button primary full" onClick={prepare} disabled={!!inputError||busy}><Sparkle size={16}/>Humanize text</button><p className="humanize-help">Instant phrase pass, on your device. Up to 1,200 words; no model download.</p>
    {inputError&&<p className="humanize-help" role="status">{inputError}</p>}
    {error&&<div className="alert error" role="alert"><WarningCircle size={18}/><span>{error}</span><button className="small-icon" aria-label="Dismiss humanizer error" onClick={()=>setError('')}><X size={15}/></button></div>}
    {notice&&<p className="humanize-notice" role="status">{notice}</p>}
    {visibleDraft&&<div className={`humanize-preview ${visibleDraft.method==='model'?'model-draft':''}`}>
      <h3 ref={preview} tabIndex={-1}>Review humanized draft</h3><p className="humanize-help">{visibleDraft.method==='model'?`${visibleDraft.changes} sentences revised by the local model`:`${visibleDraft.changes} explicit phrase edits`}. {wordCount(text)} to {wordCount(visibleDraft.text)} words.</p>
      <div className="humanize-output" aria-label="Humanized draft">{visibleDraft.text}</div>
      <details className="humanize-diff"><summary>Compare changes</summary><div aria-label="Humanization changes">{wordDiff(text,visibleDraft.text).map((part,index)=>part.kind==='added'?<ins key={index}>{part.text}</ins>:part.kind==='removed'?<del key={index}>{part.text}</del>:<span key={index}>{part.text}</span>)}</div></details>
      <div className="protection-note"><ShieldCheck size={18}/><span>{protectedValues(text).length} protected spans checked<span>Citations, values, units, qualifiers and sentence count checked. Review scientific meaning.</span></span></div>
      <button className="button primary full" onClick={()=>{if(current.current!==visibleDraft.source||!validateHumanized(text,visibleDraft.text)){setDraft(null);setError('The manuscript changed. Generate a new draft.');return;}onApply(visibleDraft.text);}}><CheckCircle size={16}/>Apply humanized draft</button>
      <div className="humanize-export"><button className="button secondary" onClick={()=>void copy()}>{copied?<Check size={16}/>:<Clipboard size={16}/>} {copied?'Copied draft':'Copy draft'}</button><button className="button secondary" onClick={download}><ArrowLineDown size={16}/>Download draft</button></div>
    </div>}
    <div className="experimental"><div><Sparkle size={15}/><strong>Deeper rewrite</strong><span>Local model</span></div><p>Generate sentence-level alternatives on your device. Each pass reviews up to two sentences. Up to 220 words. First use downloads about 120 MB. This experimental model uses its own paraphrase style.</p>
      {busy?<><p className="model-progress" role="status">{progress}</p><button className="button secondary full" onClick={()=>{stop();setBusy(false);setProgress('');setNotice('Model rewrite cancelled. Your manuscript is unchanged.');}}>Cancel rewrite<X size={15}/></button></>:<button className="button secondary full" onClick={startModel} disabled={!!inputError}>Generate a draft<Sparkle size={16}/></button>}
    </div>
    <p className="humanize-help">Revisions improve phrasing. Scientific meaning needs your review; classifier scores do not establish authorship.</p>
  </section>;
}
