import type {PoolClient} from 'pg';import {readLegacyFile} from '../legacy-file-reader.mjs';

/** Copies actual bytes to an isolated target. Recorded and actual checksums remain distinct. */
export async function importLegacyLibrary(db:PoolClient,source:any,courseId:string,mentorId:string,root=process.cwd(),ownTransaction=true){
 if(!Array.isArray(source?.libraryFiles))throw new Error('Отсутствует библиотека.');
 const allowed=['id','name','type','sizeBytes','checksumSha256','uploadedAt','uploadedBy','linkedEntity','version','status','contentPreview','contentPath','contentBase64'];
 const files:Array<{file:any;bytes:Buffer;actual:string;recorded:string|null;matches:boolean|null}>=source.libraryFiles.map((file:any)=>{for(const field of Object.keys(file))if(!allowed.includes(field))throw new Error(`Неизвестное поле libraryFiles.${field}.`);if(file.contentPreview)throw new Error('Для непустого contentPreview требуется отдельный перенос.');return {file,...readLegacyFile(file,root)}});
 if(ownTransaction)await db.query('BEGIN');try{
  const permission=await db.query('SELECT 1 FROM course_mentors WHERE course_id=$1 AND mentor_id=$2',[courseId,mentorId]);if(!permission.rowCount)throw new Error('Ментор не назначен в целевой курс.');
  const existing=await db.query('SELECT 1 FROM course_library_files WHERE course_id=$1 LIMIT 1',[courseId]);if(existing.rowCount)throw new Error('В целевом курсе библиотека уже заполнена.');
  for(const entry of files){const f=entry.file;await db.query(`INSERT INTO course_library_files(course_id,id,filename,mime_type,file_bytes,checksum_sha256,legacy_checksum_sha256,integrity_matches_legacy,legacy_declared_size,linked_entity,version_label,file_type,status,legacy_uploaded_by,legacy_content_path,uploaded_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[courseId,f.id,f.name,'application/octet-stream',entry.bytes,Buffer.from(entry.actual,'hex'),entry.recorded?Buffer.from(entry.recorded,'hex'):null,entry.matches,f.sizeBytes??null,f.linkedEntity||null,f.version||null,f.type||null,f.status||'active',f.uploadedBy||null,f.contentPath||null,mentorId,f.uploadedAt||new Date().toISOString()]);}
  if(ownTransaction)await db.query('COMMIT');return {files:files.length,checksumMismatch:files.filter(f=>f.matches===false).length};
 }catch(error){if(ownTransaction)await db.query('ROLLBACK');throw error}
}
