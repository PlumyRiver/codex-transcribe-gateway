import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const content=['GATEWAY_TOKEN='+randomBytes(32).toString('hex'),'CREDENTIALS_KEY='+randomBytes(32).toString('hex'),
  'DATA_DIR=./data','HOST=127.0.0.1','PORT=8080','MAX_CONCURRENCY=10','REQUEST_TIMEOUT_MS=120000','UPSTREAM_COOLDOWN_MS=300000',''].join('\n');
try{await fs.writeFile('.env',content,{flag:'wx',mode:0o600});console.log('Created .env with fresh keys. Keep it private.');}
catch(e){console.error(e.code==='EEXIST'?'.env already exists; nothing was overwritten.':'Could not create .env');process.exitCode=1;}
