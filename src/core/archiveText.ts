import JSZip from 'jszip';

/** Read one bounded text entry; never extract archive paths to the filesystem. */
export async function readImportedText(file:File,extensions:string[],preferred?:RegExp):Promise<{name:string;text:string}>{
 if(file.size<1||file.size>8*1024*1024)throw new Error('Размер файла должен быть от 1 байта до 8 МБ.');
 const limit=4_000_000;
 if(!file.name.toLowerCase().endsWith('.zip')){
  if(!extensions.some(ext=>file.name.toLowerCase().endsWith(ext))||file.size>limit)throw new Error('Выберите поддерживаемый текстовый файл размером до 4 МБ.');
  return {name:file.name,text:await file.text()};
 }
 let zip:JSZip;try{zip=await JSZip.loadAsync(await file.arrayBuffer())}catch{throw new Error('Не удалось открыть ZIP-архив. Проверьте формат файла.')}
 const entries=Object.values(zip.files);if(entries.length>1000)throw new Error('В архиве слишком много файлов.');
 const candidates=entries.filter(item=>!item.dir&&extensions.some(ext=>item.name.toLowerCase().endsWith(ext)));
 const preferredItems=preferred?candidates.filter(item=>preferred.test(item.name.split('/').pop()||'')):[];
 const entry=preferredItems.length===1?preferredItems[0]:candidates.length===1?candidates[0]:null;
 if(!entry)throw new Error(candidates.length?'В архиве несколько подходящих файлов. Выберите отдельный файл.':'В архиве не найден подходящий файл.');
 const original=(entry as any).unsafeOriginalName;if(typeof original==='string'&&(original!==entry.name||original.startsWith('/')||original.includes('\\')))throw new Error('Архив содержит небезопасный путь.');
 const size=(entry as any)._data?.uncompressedSize;if(typeof size!=='number'||size<1||size>limit)throw new Error('Размер файла внутри архива должен быть не более 4 МБ.');
 const text=await entry.async('string');if(new TextEncoder().encode(text).length>limit)throw new Error('Размер файла внутри архива превышает 4 МБ.');
 return {name:entry.name.split('/').pop()!,text};
}
