import pg from 'pg';import {config} from 'dotenv';import {configureRelationalRuntimeRole} from '../src/server/relational-permissions';
config({quiet:true});
for(const key of ['NEXUS_TARGET_DATABASE_URL','NEXUS_RELATIONAL_APP_USER','NEXUS_RELATIONAL_APP_PASSWORD'])if(!process.env[key])throw new Error(`Не задана переменная ${key}.`);
const pool=new pg.Pool({connectionString:process.env.NEXUS_TARGET_DATABASE_URL,connectionTimeoutMillis:10000});const db=await pool.connect();
try{const result=await configureRelationalRuntimeRole(db,process.env.NEXUS_RELATIONAL_APP_USER!,process.env.NEXUS_RELATIONAL_APP_PASSWORD!);console.log(`Роль ${result.username} настроена для базы ${result.database}.`)}finally{db.release();await pool.end()}
