import {spawn} from 'node:child_process';

const {PGHOST,PGPORT,PGDATABASE,PGUSER,PGPASSWORD}=process.env;
if(!PGHOST||!PGPORT||!PGDATABASE||!PGUSER||!PGPASSWORD)throw new Error('Не заданы параметры подключения приложения к PostgreSQL.');
const url=new URL('postgresql://localhost');url.hostname=PGHOST;url.port=PGPORT;url.pathname='/'+PGDATABASE;url.username=PGUSER;url.password=PGPASSWORD;
const child=spawn(process.execPath,['--import','tsx','server.ts'],{stdio:'inherit',env:{...process.env,NEXUS_STORAGE:'relational',NEXUS_RELATIONAL_DATABASE_URL:url.toString()}});
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Не удалось запустить сервер.');process.exitCode=1});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0)});
