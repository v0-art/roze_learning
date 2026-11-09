import fs from 'node:fs';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const required=['users','modules','topics','lessons','skills','relations','exams','libraryFiles','lessonAttempts','knowledgeGaps','homework','assessments','notifications','auditLogs','messages','graphNodes','graphEdges'];
export function parseSource(bytes) {
  let data; try { data=JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Исходный файл не является корректным JSON.'); }
  if(!data || typeof data!=='object' || Array.isArray(data)) throw new Error('Исходная база должна быть объектом.');
  if(Object.hasOwn(data,'__collections') || Object.hasOwn(data,'__proto__')) throw new Error('Исходная база содержит зарезервированное поле.');
  for(const key of required) if(!Array.isArray(data[key])) throw new Error(`В исходной базе отсутствует массив ${key}.`);
  for(const [key,value] of Object.entries(data)) if(Array.isArray(value) && value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error(`В коллекции ${key} содержится некорректная запись.`);
  return data;
}
export const checksum = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export async function loadSnapshot(client) {
  const meta=await client.query('SELECT properties,initialized FROM nexus_state_meta WHERE singleton');
  if(!meta.rows[0]?.initialized) throw new Error('PostgreSQL ещё не содержит импортированных данных.');
  const data=meta.rows[0].properties;
  for(const key of data.__collections || []) data[key]=[];
  delete data.__collections;
  const rows=await client.query('SELECT collection,data FROM nexus_entities ORDER BY collection,position');
  for(const row of rows.rows) (data[row.collection] ||= []).push(row.data);
  return data;
}
export function verifySnapshot(expected,actual) {
  if(!isDeepStrictEqual(expected,actual)) throw new Error('Содержимое данных PostgreSQL не совпадает с исходным файлом.');
}
export function backupSource(bytes,dir) {
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file=`${dir}/json-import-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(6).toString('hex')}.json`;
  fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
  try { fs.writeFileSync(`${file}.sha256`,`${checksum(bytes)}\n`,{flag:'wx',mode:0o600}); }
  catch(error) { fs.unlinkSync(file);throw error; }
  return file;
}
