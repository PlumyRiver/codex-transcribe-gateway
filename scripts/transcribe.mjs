import fs from 'node:fs/promises';
import path from 'node:path';
const [audio,output]=process.argv.slice(2);
if(!audio){console.log('Usage: npm run smoke -- AUDIO_FILE [NEW_RESULT.json]');process.exit(0);}
try{
  const info=await fs.stat(audio);if(!info.isFile()||!info.size||info.size>25*1024*1024)throw Error('Use a non-empty audio file up to 25 MiB');
  const base=new URL(process.env.GATEWAY_URL||'http://127.0.0.1:8080');
  if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname))))throw Error('GATEWAY_URL must be HTTPS or loopback HTTP');
  if(output){try{await fs.access(output);throw Error('Output already exists');}catch(e){if(e.code!=='ENOENT')throw e;}}
  const form=new FormData();form.set('model','gpt-transcribe');form.set('file',new Blob([await fs.readFile(audio)]),path.basename(audio));
  const start=performance.now();const r=await fetch(new URL('/v1/audio/transcriptions',base),{method:'POST',headers:{authorization:'Bearer '+process.env.GATEWAY_TOKEN},body:form,redirect:'error',signal:AbortSignal.timeout(130000)});
  const data=await r.json();if(!r.ok)throw Error('HTTP '+r.status+': '+(data.error?.code||'request_failed'));
  if(typeof data.text!=='string'||!data.text.trim())throw Error('No readable transcript returned');
  const result={...data,elapsedMs:Math.round(performance.now()-start)};
  if(output){await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log('Transcript saved.');}else console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
