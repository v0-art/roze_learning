import {Worker, MessageChannel, receiveMessageOnPort} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';

// The legacy application is synchronous. A dedicated worker performs PostgreSQL I/O,
// with a single-writer lease; the API does not report success before COMMIT.
export function createPostgresStore(url:string) {
  const worker = new Worker(fileURLToPath(new URL('./postgres-worker.mjs', import.meta.url)), {workerData:{url}});
  worker.on('error', error => console.error('PostgreSQL worker:', error.message));
  function call(action:'read'|'write', db?:unknown):any {
    const signal=new SharedArrayBuffer(4), flag=new Int32Array(signal), {port1,port2}=new MessageChannel();
    worker.postMessage({action,db,signal,port:port2},[port2]);
    if (Atomics.wait(flag,0,0,30000)==='timed-out') {port1.close();throw new Error('PostgreSQL не ответил вовремя.');}
    const result=receiveMessageOnPort(port1)?.message;port1.close();
    if (!result) throw new Error('PostgreSQL не вернул результат.');
    if (result.error) throw new Error(result.error);
    return result.value;
  }
  return {read:()=>call('read'),write:(db:unknown)=>call('write',db),close:()=>worker.terminate()};
}
