import {spawnSync} from 'node:child_process';
import {config} from 'dotenv';
config({path:process.env.NEXUS_RELATIONAL_CONFIG||'.env.relational',quiet:true});
config({quiet:true});
if(!process.env.NEXUS_RELATIONAL_DATABASE_URL)throw new Error('Не задан NEXUS_RELATIONAL_DATABASE_URL.');
const result=spawnSync(process.execPath,['--import','tsx','server.ts'],{stdio:'inherit',env:{...process.env,NEXUS_STORAGE:'relational'}});
process.exit(result.status??1);
