import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import JSZip from 'jszip';import {readV3Content,readV3Result} from '../src/server/v3-contracts';

test('v3 schemas accept supplied examples and both equivalent report transports',async()=>{
 const content=await readV3Content(fs.readFileSync('contracts/rozephyr-v1/examples/content/example_content.zip'));assert.equal(content.entries.length,4);
 const json=await readV3Result(fs.readFileSync('contracts/rozephyr-v1/examples/result/example_report.json'));
 const zip=await readV3Result(fs.readFileSync('contracts/rozephyr-v1/examples/result/example_result.zip'));assert.deepEqual(zip.report,json.report);
});
test('v3 contracts reject invalid reports and unsafe archives',async()=>{
 await assert.rejects(readV3Result(Buffer.from('{"format":"rozephyr-result"}')));
 const missing=new JSZip();missing.file('other.json','{}');await assert.rejects(readV3Result(await missing.generateAsync({type:'nodebuffer'})));
 const unsafe=new JSZip();unsafe.file('../report.json','{}');await assert.rejects(readV3Result(await unsafe.generateAsync({type:'nodebuffer'})));
 const oversized=new JSZip();oversized.file('report.json','x'.repeat(4_000_001));const compressed=await oversized.generateAsync({type:'nodebuffer',compression:'DEFLATE'});assert.ok(compressed.length<100_000);await assert.rejects(readV3Result(compressed),/размер/);
 const many=new JSZip();for(let i=0;i<1001;i++)many.file(`file${i}.txt`,'x');await assert.rejects(readV3Content(await many.generateAsync({type:'nodebuffer'})),/каталог/);
});
