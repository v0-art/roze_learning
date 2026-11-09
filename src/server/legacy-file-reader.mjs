import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
/** Read only embedded bytes or real files under the approved asset directory. */
export function readLegacyFile(file,root=process.cwd()) {
 let bytes;
 if(typeof file.contentBase64==='string'){
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.contentBase64)) throw new Error('Некорректное содержимое вложенного файла.');
  bytes=Buffer.from(file.contentBase64,'base64');
 }else{
  if(typeof file.contentPath!=='string'||!file.contentPath)throw new Error('Путь к файлу отсутствует.');
  const base=fs.realpathSync(path.resolve(root,'public/assets/aistudio'));
  const candidate=fs.realpathSync(path.resolve(root,file.contentPath.replace(/^[/\\]+/,'')));
  if(!candidate.startsWith(base+path.sep))throw new Error('Путь файла находится вне каталога материалов.');
  const stat=fs.statSync(candidate);if(!stat.isFile())throw new Error('Источник не является файлом.');
  bytes=fs.readFileSync(candidate);
 }
 const actual=crypto.createHash('sha256').update(bytes).digest('hex');
 const recorded=typeof file.checksumSha256==='string'&&/^[0-9a-f]{64}$/i.test(file.checksumSha256)?file.checksumSha256.toLowerCase():null;
 return {bytes,actual,recorded,matches:recorded===null?null:actual===recorded};
}
export function inspectLegacyFiles(files,root=process.cwd()) {
 const report={total:files.length,unreadable:0,checksumMismatch:0,checksumAbsent:0};
 for(const file of files){try{const result=readLegacyFile(file,root);if(result.matches===false)report.checksumMismatch++;if(result.matches===null)report.checksumAbsent++;}catch{report.unreadable++;}}
 return report;
}
