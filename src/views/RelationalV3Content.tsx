import React,{useState} from 'react';
import {part,relationalRequest} from '../services/relational';

type Change={id:string;kind:string;action:'create'|'update'|'unchanged';revision:number};
type Preview={packageId:string;changes:Change[];warnings?:string[]};
type Entry={id:string;kind:string;title:string;latestRevision:number;publishedRevision:number|null};
type Publication={published:string[];skipped:Array<{id:string;reason:string}>};
const button='rounded-lg border border-violet-300/25 px-3 py-2 text-sm text-violet-100 hover:bg-violet-300/10 disabled:opacity-50';

export function RelationalV3Content({courseId,onUpdated}:{courseId:string;onUpdated?:()=>Promise<void>}){
 const [entries,setEntries]=useState<Entry[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[warnings,setWarnings]=useState<string[]>([]);
 const base=`/courses/${part(courseId)}/content-v3`;
 async function refresh(){setEntries(await relationalRequest<Entry[]>(base))}
 async function open(e:React.SyntheticEvent<HTMLDetailsElement>){if(!e.currentTarget.open||entries!==null)return;try{await refresh()}catch(err){setError(err instanceof Error?err.message:'Не удалось загрузить материалы.')}}
 async function choose(e:React.ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value='';setError('');setNotice('');setWarnings([]);if(!file)return;
  if(file.size>8*1024*1024){setError('Размер ZIP не должен превышать 8 МиБ.');return}
  setBusy(true);try{
   const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const zipBase64=btoa(binary);
   const check=await relationalRequest<Preview>(`${base}/preview`,{zipBase64});
   const result=await relationalRequest<Preview&{publication:Publication}>(`${base}/import`,{zipBase64});await refresh();await onUpdated?.();setWarnings(check.warnings||[]);
   setNotice(`Пакет загружен и опубликован. Новых материалов: ${result.changes.filter(c=>c.action==='create').length}, обновлено: ${result.changes.filter(c=>c.action==='update').length}, без изменений: ${result.changes.filter(c=>c.action==='unchanged').length}.`);
  }catch(err){setError(err instanceof Error?err.message:'Не удалось проверить или загрузить пакет.')}finally{setBusy(false)}
 }
 async function publishAll(){setBusy(true);setError('');setNotice('');setWarnings([]);try{const result=await relationalRequest<Publication>(`${base}/publish-all`,{});await refresh();await onUpdated?.();setNotice(`Опубликовано материалов: ${result.published.length}.`);setWarnings(result.skipped.map(item=>`${item.id}: ${item.reason}`))}catch(err){setError(err instanceof Error?err.message:'Не удалось опубликовать материалы.')}finally{setBusy(false)}}
 async function download(){setBusy(true);setError('');try{const response=await fetch(`/api/relational${base}/export`,{cache:'no-store'});if(!response.ok)throw new Error('Не удалось выгрузить пакет.');const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='rozephyr-content.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(err){setError(err instanceof Error?err.message:'Не удалось выгрузить пакет.')}finally{setBusy(false)}}
 return <details className="rounded-2xl border border-violet-300/20 bg-[#1b1429] p-5" onToggle={e=>void open(e)}><summary className="cursor-pointer font-semibold">Загрузить учебный пакет</summary><div className="mt-4 space-y-4 text-sm">
  <p className="text-slate-300">Выберите подготовленный ZIP модуля, темы или занятия. Платформа проверит архив, загрузит и опубликует его содержимое.</p>
  <label className="block text-violet-200">ZIP-пакет<input type="file" accept=".zip,application/zip" className="mt-2 block max-w-full text-sm" disabled={busy} onChange={e=>void choose(e)}/></label>
  {busy&&<p role="status">Проверяем материалы…</p>}{error&&<p role="alert" className="text-rose-300">{error}</p>}{notice&&<p role="status" className="text-sky-300">{notice}</p>}{warnings.map(warning=><p key={warning} className="text-amber-200">{warning}</p>)}
  {entries&&entries.length>0&&<><div className="flex flex-wrap gap-2">{entries.some(item=>item.latestRevision!==item.publishedRevision)&&<button type="button" className={button} disabled={busy} onClick={()=>void publishAll()}>Опубликовать ранее загруженные материалы</button>}<button type="button" className={button} disabled={busy} onClick={()=>void download()}>Скачать пакет курса</button></div><details><summary className="cursor-pointer text-violet-200">Состав загруженных материалов: {entries.length}</summary><ul className="mt-2 max-h-64 space-y-1 overflow-auto text-slate-300">{entries.map(item=><li key={item.id}>{item.id} · {item.title} · {item.publishedRevision===item.latestRevision?'опубликован':'не опубликован'}</li>)}</ul></details></>}
 </div></details>;
}
