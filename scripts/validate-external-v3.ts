import fs from 'node:fs';import JSZip from 'jszip';import {readV3Result,validateV3} from '../src/server/v3-contracts';

/** Local contract check only: it does not save a result or verify educational content. */
async function main(){
 const [sessionPath,resultPath]=process.argv.slice(2);if(!sessionPath||!resultPath||process.argv.length!==4)throw new Error('Использование: npm run test:v3:external -- <session-package.zip> <report.json или session-result.zip>');
 const session=await JSZip.loadAsync(fs.readFileSync(sessionPath)),manifestFile=session.file('manifest.json');if(!manifestFile)throw new Error('В архиве занятия нет manifest.json.');
 const manifest=JSON.parse(await manifestFile.async('string'));validateV3('session-manifest.schema.json',manifest);const {report}=await readV3Result(fs.readFileSync(resultPath));
 if(report.sessionId!==manifest.sessionId||report.itemId!==manifest.itemId||report.itemType!==manifest.itemType)throw new Error('Отчёт относится к другой сессии или занятию.');
 console.log('Структура отчёта и привязка к архиву занятия проверены. Результат не сохранён в платформе.');
}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'Не удалось проверить файлы.');process.exitCode=1});
