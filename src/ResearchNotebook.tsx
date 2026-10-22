import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowCounterClockwise,ArrowLineDown,ArrowRight,CheckCircle,Flask,UploadSimple,WarningCircle} from '@phosphor-icons/react';
import {anchors,auditRevision,claimSentences,wordDiff,type ClaimRow} from '../lib/integrity.ts';
import {createReviewBundle,verifyReviewBundle} from '../lib/review-bundle.ts';
import {verifyProbeReport} from '../lib/probe-report.ts';
import type {RobustnessReport} from '../lib/robustness.ts';
import {wordCount} from '../lib/writing.ts';
import {reviewExampleOriginal,reviewExampleRevised} from './notebook-example.ts';
import './notebook.css';

type Snapshot={id:string;label:string;text:string;title:string;createdAt:string};
const labels=['Human-written','AI-revised','AI-generated'];
const snapshot=(text:string,title:string,label:string):Snapshot=>({id:crypto.randomUUID(),text,title,label,createdAt:new Date().toISOString()});
function saveFile(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function ClaimComparison({row}:{row:ClaimRow}){
  const diff=useMemo(()=>wordDiff(row.before,row.after),[row.before,row.after]);
  return <details className="claim-row" data-status={row.status}>
    <summary><span className="claim-index">{row.originalIndex===null?'New':`S${row.originalIndex+1}`}</span><span className="claim-caption"><strong>{row.findings[0]?.message??(row.status==='unchanged'?'Text unchanged':row.moved?'Sentence moved or shifted':'Wording changed; review meaning.')}</strong><span>{row.after||row.before}</span></span><span className={`claim-status ${row.findings.length?'has-findings':''}`}>{row.findings.length?`${row.findings.length} ${row.findings.length===1?'flag':'flags'}`:row.status}</span><ArrowRight className="claim-expand" size={16}/></summary>
    <div className="claim-detail">{row.findings.length>0&&<ul>{row.findings.map(finding=><li key={finding.kind}><WarningCircle size={16}/>{finding.message}</li>)}</ul>}
      <div className="claim-diff" aria-label="Word changes">{diff.map((part,index)=>part.kind==='removed'?<del key={index}>{part.text}</del>:part.kind==='added'?<ins key={index}>{part.text}</ins>:<span key={index}>{part.text}</span>)}</div>
      <p>Baseline {row.originalIndex===null?'not matched':`sentence ${row.originalIndex+1}`} · Current {row.currentIndex===null?'not matched':`sentence ${row.currentIndex+1}`}{row.moved?' · Position changed':''}{row.before&&row.after?` · ${(row.similarity*100).toFixed(0)}% word-set overlap`:''}</p>
    </div>
  </details>;
}

export default function ResearchNotebook({text,title,onLoad}:{text:string;title:string;onLoad:(text:string,title:string)=>void}){
  const [snapshots,setSnapshots]=useState<Snapshot[]>([]);const [activeId,setActiveId]=useState('');const [label,setLabel]=useState('');
  const [filter,setFilter]=useState<'all'|'flagged'>('all');const [error,setError]=useState('');const [message,setMessage]=useState('');
  const [probes,setProbes]=useState<RobustnessReport|null>(null);const [busy,setBusy]=useState(false);const [probeError,setProbeError]=useState('');const [fileBusy,setFileBusy]=useState(false);
  const [restoreUndo,setRestoreUndo]=useState<{text:string;title:string;restoredText:string;restoredTitle:string}|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);const controller=useRef<AbortController|null>(null);const current=useRef(text);current.current=text;
  const baseline=snapshots.find(item=>item.id===activeId);
  const comparison=useMemo(()=>{if(!baseline)return {audit:null,error:''};try{return {audit:auditRevision(baseline.text,text),error:''};}catch(reason){return {audit:null,error:(reason as Error).message};}},[baseline,text]);
  const audit=comparison.audit;
  useEffect(()=>{controller.current?.abort();controller.current=null;setProbes(null);setBusy(false);setProbeError('');return()=>{controller.current?.abort();};},[text]);

  function capture(){
    setError('');setMessage('');
    try{if(!text.trim())throw new Error('Write a draft before saving a checkpoint.');claimSentences(text);if(snapshots.length>=8)throw new Error('Keep up to eight checkpoints. Remove one before adding another.');
      const next=snapshot(text,title,label.trim()||`Draft ${snapshots.length+1}`);setSnapshots(items=>[...items,next]);if(!baseline)setActiveId(next.id);setLabel('');setMessage(`Saved ${next.label} in this tab.`);
    }catch(reason){setError((reason as Error).message);}
  }
  function removeCheckpoint(){if(!baseline)return;const remaining=snapshots.filter(item=>item.id!==baseline.id);setSnapshots(remaining);setActiveId(remaining[0]?.id??'');setMessage('Checkpoint removed. The current draft is unchanged.');setError('');}
  function loadExample(){
    if(snapshots.length>6){setError('The example needs room for two checkpoints. Remove checkpoints first.');return;}
    const before=snapshot(text,title,'Before comparison example');const original=snapshot(reviewExampleOriginal,'Activity and sleep: illustrative review case','Original review example');
    setSnapshots(items=>[...items,before,original]);setActiveId(original.id);onLoad(reviewExampleRevised,original.title);setError('');setMessage('Illustrative comparison loaded. The current draft intentionally changes a quantity and strengthens a claim.');setFilter('all');
  }
  async function exportReview(){
    if(!baseline)return;setFileBusy(true);setError('');
    try{const bundle=await createReviewBundle(title,baseline,text);saveFile('marginal-review.json',bundle);setMessage(`Exported review ${bundle.sha256.slice(0,12)}. Both drafts and the recomputed audit are included.`);}catch(reason){setError((reason as Error).message);}finally{setFileBusy(false);}
  }
  async function importReview(file:File){
    setError('');setFileBusy(true);const startingText=text;
    try{if(file.size>512000)throw new Error('Review files must be smaller than 512 KB.');if(snapshots.length>6)throw new Error('Import needs room for two checkpoints. Remove checkpoints first.');
      const bundle=await verifyReviewBundle(await file.text());if(current.current!==startingText)throw new Error('The manuscript changed during import. Import again to restore this record.');
      const before=snapshot(startingText,title,`Before review import ${snapshots.length+1}`);const imported=snapshot(bundle.payload.baseline.text,bundle.payload.title,bundle.payload.baseline.label);
      setSnapshots(items=>[...items,before,imported]);setActiveId(imported.id);onLoad(bundle.payload.manuscript,bundle.payload.title);setMessage('Checksum, model identity and recomputed audit verified. Review restored; the previous draft is saved as a checkpoint.');
    }catch(reason){setError((reason as Error).message);}finally{setFileBusy(false);if(fileInput.current)fileInput.current.value='';}
  }
  async function runProbes(){
    controller.current?.abort();const next=new AbortController();controller.current=next;const source=text;setBusy(true);setProbeError('');setProbes(null);
    const timer=setTimeout(()=>next.abort(new Error('The robustness check timed out. Try again.')),30000);
    try{const response=await fetch('/api/robustness',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:source}),signal:next.signal});const data=await response.json();if(!response.ok)throw new Error(data.error??'The robustness check failed.');
      const verified=await verifyProbeReport(data,source);
      if(current.current===source&&controller.current===next&&!next.signal.aborted)setProbes(verified);
    }catch(reason){if(current.current===source&&controller.current===next)setProbeError(next.signal.reason instanceof Error?next.signal.reason.message:reason instanceof Error?reason.message:'The robustness service is unavailable.');}
    finally{clearTimeout(timer);if(controller.current===next){setBusy(false);controller.current=null;}}
  }
  const canProbe=wordCount(text)>=60&&wordCount(text)<=1200&&text.length<=18000;
  const rows=audit?.rows.filter(row=>filter==='all'||row.findings.length>0)??[];
  return <section className="research-notebook" aria-label="Research notebook">
    <div className="notebook-heading"><div><h2>Research notebook</h2><p>Track the claims through a revision, then inspect how the classifier responds to controlled changes.</p></div><button className="button secondary" onClick={loadExample} disabled={fileBusy}>Load comparison example<ArrowRight size={16}/></button></div>
    <div className="notebook-controls"><label>Checkpoint name<input value={label} onChange={event=>setLabel(event.target.value)} maxLength={60} placeholder={`Draft ${snapshots.length+1}`}/></label><button className="button primary" onClick={capture} disabled={fileBusy||!text.trim()}>Save checkpoint</button><label>Compare against<select aria-label="Compare against" value={activeId} onChange={event=>setActiveId(event.target.value)} disabled={!snapshots.length||fileBusy}>{!snapshots.length&&<option value="">Save a checkpoint first</option>}{snapshots.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button className="button secondary" onClick={()=>{if(baseline){setRestoreUndo({text,title,restoredText:baseline.text,restoredTitle:baseline.title});onLoad(baseline.text,baseline.title);setMessage('Checkpoint restored to the manuscript.');}}} disabled={!baseline||fileBusy}><ArrowCounterClockwise size={16}/>Restore checkpoint</button><button className="text-button" onClick={removeCheckpoint} disabled={!baseline||fileBusy}>Remove checkpoint</button></div>
    <p className="notebook-help">{snapshots.length}/8 checkpoints in this tab. Export a review to keep it after closing the page. Restoring a checkpoint replaces the current draft.</p>
    {error&&<div className="alert error" role="alert"><WarningCircle size={18}/><span>{error}</span></div>}{message&&<div className="alert success" role="status"><CheckCircle size={18}/><span>{message}</span>{restoreUndo&&restoreUndo.restoredText===text&&restoreUndo.restoredTitle===title&&<button onClick={()=>{onLoad(restoreUndo.text,restoreUndo.title);setRestoreUndo(null);setMessage('Previous notebook draft restored.');}}>Undo restore</button>}</div>}
    <div className="notebook-documents"><section><div className="notebook-document-label"><h3>Baseline</h3><span>{baseline?`${wordCount(baseline.text)} words`:'No checkpoint'}</span></div>{baseline?<><p className="notebook-baseline">{baseline.text}</p><p className="notebook-help">{baseline.label} · {new Date(baseline.createdAt).toLocaleString()}</p></>:<div className="notebook-empty"><h3>Give this draft a reference point.</h3><p>Save a checkpoint before editing, or load the illustrative comparison to inspect changed quantities and stronger claims.</p></div>}</section><section><div className="notebook-document-label"><label htmlFor="notebook-manuscript">Current manuscript</label><span>{wordCount(text)} words</span></div><textarea id="notebook-manuscript" aria-label="Notebook manuscript" value={text} onChange={event=>onLoad(event.target.value,title)} spellCheck/><p className="notebook-help">{anchors(text).citations.length} citation spans · {anchors(text).quantities.length} quantities detected</p></section></div>
    <section className="notebook-audit" aria-label="Scientific integrity audit"><div className="notebook-section-heading"><div><h3>Claim change ledger</h3><p>Sentence matching and wording checks are deterministic heuristics. Review the source and scientific meaning for every flagged claim.</p></div>{audit&&<div className="notebook-filters" aria-label="Claim filter"><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>All sentences</button><button aria-pressed={filter==='flagged'} onClick={()=>setFilter('flagged')}>Needs review ({audit.summary.flagged})</button></div>}</div>
      {comparison.error?<div className="alert error" role="alert">{comparison.error}</div>:!audit?<p className="notebook-empty-line">Save a baseline to compare sentence changes.</p>:<><dl className="notebook-counts"><div><dt>Unchanged</dt><dd>{audit.summary.unchanged}</dd></div><div><dt>Reworded</dt><dd>{audit.summary.modified}</dd></div><div><dt>Added / removed</dt><dd>{audit.summary.added} / {audit.summary.removed}</dd></div><div><dt>Review flags</dt><dd>{audit.summary.findings}</dd></div></dl><div className="claim-list">{rows.length?rows.map(row=><ClaimComparison key={row.id} row={row}/>):<p className="notebook-empty-line">No sentence flags match this filter. Heuristics cannot establish that scientific meaning is unchanged.</p>}</div></>}
    </section>
    <section className="notebook-probes" aria-label="Model robustness"><div className="notebook-section-heading"><div><h3>Model robustness</h3><p>Measure five probes on this draft with the deployed classifier. Order and omission probes change context or information.</p></div>{busy?<button className="button secondary" onClick={()=>{controller.current?.abort();controller.current=null;setBusy(false);setProbeError('');}}>Cancel check</button>:<button className="button secondary" onClick={()=>void runProbes()} disabled={!canProbe}><Flask size={17}/>Run robustness check</button>}</div>
      {!canProbe&&<p className="notebook-help">Use 60 to 1,200 words and at most 18,000 characters for model probes.</p>}{busy&&<p className="notebook-loading" role="status">Running controlled probes against the current model…</p>}{probeError&&<div className="alert error" role="alert"><WarningCircle size={18}/>{probeError}</div>}
      {probes&&<div className="robustness-results"><div className="robustness-summary"><strong>{probes.summary.decisionChanges} / {probes.summary.measured} decision changes</strong><span>{(probes.summary.maxProbabilityShift*100).toFixed(2)} percentage points largest score shift</span><button className="text-button" onClick={()=>saveFile('marginal-robustness.json',probes)}>Export probe results<ArrowLineDown size={16}/></button></div><div className="robustness-table"><table><thead><tr><th>Probe</th><th>Reference pattern</th><th>Largest shift</th><th>Signal status</th></tr></thead><tbody>{probes.cases.map(item=><tr key={item.id}><th scope="row">{item.name}<span>{item.description}</span></th><td>{item.status==='skipped'?'Skipped':labels[item.winner]}</td><td>{item.status==='skipped'?'Not measured':`${(item.maxProbabilityShift*100).toFixed(2)} pp`}</td><td>{item.status==='skipped'?item.reason:item.indeterminate?'Inconclusive':item.changed?'Measured':'Identical input'}</td></tr>)}</tbody></table></div><p className="notebook-help">Diagnostic results apply to this draft and model. Stable responses do not establish authorship or general reliability. SHA-256 <code>{probes.inputSha256.slice(0,16)}</code></p></div>}
    </section>
    <div className="notebook-export"><div><h3>Take the review with you.</h3><p>Export both drafts, model identity and a recomputable audit. A checksum detects changed contents; the unsigned record does not authenticate its creator.</p></div><div><button className="button secondary" onClick={()=>void exportReview()} disabled={!baseline||!audit||fileBusy}><ArrowLineDown size={16}/>Export review</button><button className="button secondary" onClick={()=>fileInput.current?.click()} disabled={fileBusy}><UploadSimple size={16}/>Import review</button><input ref={fileInput} type="file" accept="application/json,.json" aria-label="Import review file" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void importReview(file);}}/></div></div>
    <p className="notebook-help">Import verifies the checksum and recomputes the audit before restoring the draft. The current draft is saved as a checkpoint first.</p>
  </section>;
}

