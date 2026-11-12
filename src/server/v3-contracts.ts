import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

const schemaDir=path.join(process.cwd(),'contracts','rozephyr-v1','schemas');
const ajv=new Ajv2020({allErrors:true,strict:false});
addFormats(ajv);
const validators=new Map<string,ReturnType<typeof ajv.compile>>();
export function validateV3(name:string,value:unknown):void {
 let validate=validators.get(name);
 if(!validate){validate=ajv.compile(JSON.parse(fs.readFileSync(path.join(schemaDir,name),'utf8')));validators.set(name,validate)}
 if(!validate(value))throw invalid(`Нарушена схема ${name}: ${ajv.errorsText(validate.errors,{separator:'; '})}`);
}
const invalid=(message:string)=>Object.assign(new Error(message),{code:'INVALID_INPUT'});
const safe=(name:string)=>!!name&&!name.startsWith('/')&&!name.includes('\\')&&name.split('/').every(p=>p!==''&&p!=='.'&&p!=='..');
function canonical(value:any):any {if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value}
export function canonicalJson(value:unknown):string{return JSON.stringify(canonical(value))}
/** Inspect every central-directory entry before JSZip can collapse duplicate names. */
function inspectDirectory(bytes:Buffer){
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break}
 if(end<0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)throw invalid('Некорректный ZIP-каталог.');
 const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16),length=bytes.readUInt32LE(end+12);if(count>1000||offset+length>end)throw invalid('ZIP-каталог слишком велик или повреждён.');
 const seen=new Set<string>();let pos=offset,total=0;
 for(let i=0;i<count;i++){
  if(pos+46>end||bytes.readUInt32LE(pos)!==0x02014b50)throw invalid('Повреждён ZIP-каталог.');
  const size=bytes.readUInt32LE(pos+24),n=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32),next=pos+46+n+extra+comment;
  if(next>offset+length||size>4_000_000||(total+=size)>80*1024*1024)throw invalid('Превышен размер файлов ZIP.');
  let name:string;try{name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(pos+46,pos+46+n))}catch{throw invalid('Некорректное имя файла ZIP.')}
  const clean=name.endsWith('/')?name.slice(0,-1):name;if(!safe(clean)||seen.has(name))throw invalid('Небезопасный или повторный путь в ZIP.');seen.add(name);pos=next;
 }
 if(pos!==offset+length)throw invalid('Повреждён ZIP-каталог.');
}
export function contentHash(value:unknown,assets:Record<string,string>):Buffer {
 const entity={...(value as any)};delete entity.version;delete entity.status;
 function normalize(node:any):any{if(Array.isArray(node))return node.map(normalize);if(node&&typeof node==='object')return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,key==='textPath'&&typeof value==='string'&&Object.hasOwn(assets,value)?`sha256:${crypto.createHash('sha256').update(assets[value]).digest('hex')}`:normalize(value)]));return node}
 return crypto.createHash('sha256').update(JSON.stringify(canonical(normalize(entity)))).digest();
}
export type ContentEntry={id:string;kind:string;value:any;assets:Record<string,string>;hash:Buffer};
export async function readV3Content(bytes:Buffer):Promise<{manifest:any;entries:ContentEntry[]}> {
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>8*1024*1024)throw invalid('Размер ZIP должен быть не более 8 МБ.');
 inspectDirectory(bytes);
 let zip:JSZip;try{zip=await JSZip.loadAsync(bytes)}catch{throw invalid('Не удалось прочитать ZIP.');}
 const files=Object.values(zip.files).filter(entry=>!entry.dir);
 if(files.length>1000)throw invalid('В архиве слишком много файлов.');
 let total=0;
 for(const entry of files){const original=(entry as any).unsafeOriginalName;const size=(entry as any)._data?.uncompressedSize;
  if(!safe(entry.name)||(typeof original==='string'&&original!==entry.name)||typeof size!=='number'||size<0||size>4_000_000)throw invalid('Небезопасный путь или размер файла в ZIP.');
  total+=size;if(total>80*1024*1024)throw invalid('Распакованный архив слишком велик.');
 }
 const decoder=new TextDecoder('utf-8',{fatal:true});
 async function read(name:string):Promise<string>{if(!safe(name)||!zip.file(name))throw invalid(`Нет файла ${name}.`);try{return decoder.decode(await zip.file(name)!.async('uint8array'))}catch{throw invalid(`Файл ${name} не является корректным UTF-8.`)}}
 async function json(name:string):Promise<any>{const source=await read(name);try{return JSON.parse(source)}catch{throw invalid(`Некорректный JSON: ${name}.`)}}
 const manifest=await json('manifest.json');validateV3('content-manifest.schema.json',manifest);
 const ids=new Set<string>(),paths=new Set<string>(),entries:ContentEntry[]=[];
 for(const item of manifest.entries){
  if(ids.has(item.id)||paths.has(item.path))throw invalid('Повторяются ID или пути записей пакета.');ids.add(item.id);paths.add(item.path);
  const value=await json(item.path);validateV3(item.kind==='curriculum_plan'?'curriculum-plan.schema.json':'content-entity.schema.json',value);
  if(item.kind!=='curriculum_plan'&&(value.id!==item.id||value.kind!==item.kind))throw invalid('Запись не совпадает с манифестом.');
  const assets:Record<string,string>={};const pathsToRead=new Set<string>();
  function collect(node:any){if(Array.isArray(node)){for(const value of node)collect(value)}else if(node&&typeof node==='object'){for(const [key,value] of Object.entries(node)){if(key==='textPath'&&typeof value==='string')pathsToRead.add(value);else collect(value)}}}
  collect(value);for(const asset of pathsToRead)assets[asset]=await read(asset);
  entries.push({id:item.id,kind:item.kind,value,assets,hash:contentHash(value,assets)});
 }
 return {manifest,entries};
}

/** Both result transports use the same report schema and preserve original bytes. */
export async function readV3Result(bytes:Buffer):Promise<{report:any;raw:Buffer}> {
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>8*1024*1024)throw invalid('Некорректный размер отчёта.');
 let raw=bytes;
 if(bytes.length>=4&&bytes.readUInt32LE(0)===0x04034b50){
  inspectDirectory(bytes);let zip:JSZip;try{zip=await JSZip.loadAsync(bytes)}catch{throw invalid('Не удалось прочитать ZIP отчёта.')}
  for(const file of Object.values(zip.files)){const original=(file as any).unsafeOriginalName;if(original&&original!==file.name)throw invalid('Небезопасный путь в ZIP отчёта.')}
  const entry=zip.file('report.json');if(!entry)throw invalid('В архиве отсутствует report.json.');raw=await entry.async('nodebuffer');
 }
 if(raw.length>4_000_000)throw invalid('Размер отчёта превышает 4 МБ.');
 let report:any;try{report=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}catch{throw invalid('Отчёт должен быть корректным JSON в UTF-8.')}
 validateV3('report.schema.json',report);return {report,raw};
}
