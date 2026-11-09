import React, {useEffect, useMemo, useState} from 'react';
import {FolderOpen, FileText, Download, Plus, Search} from 'lucide-react';
import {getLibraryFiles, getModules, subscribeToDatabase, syncDatabaseFromServer} from '../services/storage';
import {LibraryFileItem} from '../types';

const kind = (entity: string) => /-EX\d+/.test(entity) ? 'Билеты' : /-T\d+-U\d+/.test(entity) ? 'Уроки' : /-T\d+/.test(entity) ? 'Темы' : /^M\d+$/.test(entity) ? 'Модули' : 'Общие материалы';
export const AdminLibraryView: React.FC<{navigate?: (route:string)=>void}> = () => {
  const [files,setFiles]=useState(getLibraryFiles());
  const [query,setQuery]=useState('');
  const [folder,setFolder]=useState('Все материалы');
  const [module,setModule]=useState('Все модули');
  const [editing,setEditing]=useState<LibraryFileItem | null>(null);
  const [creating,setCreating]=useState(false);
  const [name,setName]=useState(''); const [entity,setEntity]=useState('GLOBAL');
  const [replacement,setReplacement]=useState<File | null>(null);
  const [message,setMessage]=useState('');
  useEffect(()=>subscribeToDatabase(()=>setFiles(getLibraryFiles())),[]);
  const active=files.filter(f=>f.status!=='archived');
  const visible=useMemo(()=>active.filter(f => (folder==='Все материалы'||kind(f.linkedEntity)===folder) && (module==='Все модули'||f.linkedEntity.startsWith(module)) && `${f.name} ${f.linkedEntity}`.toLowerCase().includes(query.toLowerCase())),[files,folder,module,query]);
  const start=(f?:LibraryFileItem)=>{setEditing(f||null);setCreating(!f);setName(f?.name||'');setEntity(f?.linkedEntity||'GLOBAL');setReplacement(null);setMessage('');};
  const save=async(e:React.FormEvent)=>{e.preventDefault();let contentBase64:string|undefined;
    if(replacement) {if(replacement.size>8388608){setMessage('Размер файла не должен превышать 8 МБ.');return;} contentBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(replacement);});}
    const response=await fetch('/api/library/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(editing?{id:editing.id}:{}),name,linkedEntity:entity.trim().toUpperCase(),...(contentBase64?{contentBase64}:{})})});
    const result=await response.json().catch(()=>({}));if(!response.ok){setMessage(result.error||'Не удалось сохранить файл.');return;}
    await syncDatabaseFromServer();setEditing(null);setCreating(false);setMessage('Материал сохранён.');
  };
  const remove=async(f:LibraryFileItem)=>{if(!window.confirm(`Убрать «${f.name}» из библиотеки? Его запись будет сохранена в архиве.`))return;
    const response=await fetch('/api/library/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:f.id})});
    if(!response.ok){setMessage('Не удалось убрать материал.');return;}await syncDatabaseFromServer();setMessage('Материал убран в архив.');
  };
  return <div className="max-w-7xl mx-auto p-5 sm:p-8 space-y-6 text-slate-100">
    <header className="flex flex-wrap justify-between gap-4"><div><h1 className="text-2xl font-bold">Библиотека материалов</h1><p className="mt-2 text-sm text-slate-400">Документы курса по модулям, темам, урокам и билетам. Выберите раздел и модуль, чтобы найти нужный файл.</p></div><button onClick={()=>start()} className="flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-2 text-sm font-bold text-slate-950"><Plus size={17}/> Добавить файл</button></header>
    {message && <p role="status" className="rounded-lg border border-violet-700 p-3 text-sm">{message}</p>}
    {(creating||editing) && <form onSubmit={save} className="grid gap-3 rounded-2xl border border-violet-700 bg-[#20172f] p-5"><h2 className="font-bold">{editing?'Изменить материал':'Добавить материал'}</h2>
      <label className="text-sm">Название файла<input required value={name} onChange={e=>setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-900 p-2" placeholder="Например, теория.md"/></label>
      <label className="text-sm">Раздел курса <span className="text-slate-400">(GLOBAL, M01, M01-T01, M01-T01-U01 или M01-EX01)</span><input required value={entity} onChange={e=>setEntity(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-900 p-2"/></label>
      <label className="text-sm">{editing?'Заменить содержимое (необязательно)':'Файл'} <span className="text-slate-400">до 8 МБ: PDF, MD, TXT, JSON, ZIP</span><input type="file" accept=".pdf,.md,.txt,.json,.zip" required={!editing} onChange={e=>{const f=e.target.files?.[0]||null;setReplacement(f);if(f&&!name)setName(f.name);}} className="mt-2 block w-full text-sm"/></label>
      <div className="flex gap-2"><button className="rounded-lg bg-violet-400 px-4 py-2 text-slate-950">Сохранить</button><button type="button" onClick={()=>{setCreating(false);setEditing(null);}} className="rounded-lg border border-slate-600 px-4 py-2">Отмена</button></div>
    </form>}
    <div className="grid gap-5 md:grid-cols-[230px_1fr]"><aside className="rounded-2xl border border-slate-700 bg-[#20172f] p-4"><h2 className="mb-3 font-semibold">Разделы</h2>{['Все материалы','Общие материалы','Модули','Темы','Уроки','Билеты'].map(x=><button key={x} onClick={()=>setFolder(x)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${folder===x?'bg-violet-500/30 text-white':'text-slate-300 hover:bg-slate-800'}`}><FolderOpen size={16}/>{x}<span className="ml-auto text-xs text-slate-400">{x==='Все материалы'?active.length:active.filter(f=>kind(f.linkedEntity)===x).length}</span></button>)}</aside>
    <section className="min-w-0 space-y-4"><div className="flex flex-wrap gap-3"><label className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-slate-600 px-3"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по названию или коду" className="w-full bg-transparent py-2 text-sm outline-none"/></label><label className="text-sm"><span className="sr-only">Модуль</span><select value={module} onChange={e=>setModule(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-900 p-2"><option>Все модули</option>{getModules().map(m=><option key={m.id} value={m.id}>{m.id} · {m.title}</option>)}</select></label></div>
      <p className="text-sm text-slate-400">{folder} · найдено: {visible.length}</p>
      {visible.length===0?<p className="rounded-xl border border-slate-700 p-8 text-center text-slate-400">В этом разделе пока нет материалов.</p>:<div className="space-y-2">{visible.map(f=><article key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-[#20172f] p-4"><FileText className="text-violet-300" size={20}/><div className="min-w-48 flex-1"><p className="font-semibold">{f.name}</p><p className="mt-1 text-xs text-slate-400">{kind(f.linkedEntity)} / {f.linkedEntity} · {(f.sizeBytes/1024).toFixed(1)} КБ</p></div><a href={`/api/library/download/${f.id}`} download={f.name} className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-sm"><Download size={15}/> Скачать</a><button onClick={()=>start(f)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Изменить</button><button onClick={()=>void remove(f)} className="rounded-lg border border-rose-800 px-3 py-2 text-sm text-rose-300">Удалить</button></article>)}</div>}
    </section></div>
  </div>;
};
