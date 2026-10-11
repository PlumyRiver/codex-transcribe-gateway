import http from 'node:http';
import {MODEL,AUDIO_ENDPOINT,MAX_UPLOAD,MAX_AUDIO,error} from './config.mjs';
import {equal,limitedJson} from './oauth.mjs';

const TYPES={wav:'audio/wav',mp3:'audio/mpeg',mp4:'audio/mp4',m4a:'audio/mp4',mpeg:'audio/mpeg',mpga:'audio/mpeg',flac:'audio/flac',ogg:'audio/ogg',webm:'audio/webm'};
const PATHS=new Set(['/v1/audio/transcriptions','/internal/sub2api/v1/audio/transcriptions']);
const safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(s)?s:null;
export async function parseAudio(bytes,contentType) {
  if(bytes.length>MAX_UPLOAD)throw error('upload_too_large',413);
  let form;try{form=await new Request('http://localhost/',{method:'POST',headers:{'content-type':contentType||''},body:bytes}).formData();}
  catch{throw error('invalid_multipart',400);}
  const allowed=new Set(['file','model','response_format','language','prompt','languages[]','keywords[]']);
  for(const name of new Set(form.keys())){
    const values=form.getAll(name),array=name.endsWith('[]');
    if(!allowed.has(name)||!array&&values.length!==1)throw error('unsupported_or_duplicate_field',400);
    if(name==='file')continue;
    if(values.some(v=>typeof v!=='string'))throw error('invalid_field',400);
    if(name==='model'&&values[0]!==MODEL)throw error('unsupported_model',400);
    if(name==='response_format'&&values[0]!=='json')throw error('unsupported_response_format',400);
    if(name==='prompt'&&[...values[0]].length>65536)throw error('prompt_too_long',400);
    if(name==='language'&&(values[0].length>20||!values[0]))throw error('invalid_language',400);
    if(name==='languages[]'&&(values.length>4||values.some(v=>!v||v.length>20)))throw error('invalid_languages',400);
    if(name==='keywords[]'&&(values.length>992||values.some(v=>!v||[...v].length>80)))throw error('invalid_keywords',400);
  }
  const file=form.get('file');
  if(!file||typeof file==='string'||!file.size||file.size>MAX_AUDIO)throw error('invalid_audio_file',400);
  const ext=file.name.split('.').pop().toLowerCase();if(!Object.hasOwn(TYPES,ext))throw error('unsupported_audio_type',400);
  const out=new FormData();out.set('file',new Blob([await file.arrayBuffer()],{type:TYPES[ext]}),'audio.'+ext);
  out.set('model',MODEL);out.set('response_format','json');
  for(const name of ['language','prompt','languages[]','keywords[]'])for(const value of form.getAll(name))out.append(name,value);
  return out;
}
async function readUpload(req) {
  const declared=Number(req.headers['content-length']);
  if(Number.isFinite(declared)&&declared>MAX_UPLOAD)throw error('upload_too_large',413);
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>MAX_UPLOAD)throw error('upload_too_large',413);chunks.push(chunk);}
  return Buffer.concat(chunks);
}
export async function classifyResponse(response) {
  if(response.headers.get('cf-mitigated')?.toLowerCase()==='challenge'){await response.body?.cancel();return 'upstream_challenge_required';}
  if(response.headers.get('content-type')?.includes('text/html')){await response.body?.cancel();return 'upstream_html_response';}
  if(response.headers.get('content-type')?.includes('json')){
    try{const d=await limitedJson(response);if(d?.error?.code==='billing_not_active'||d?.error?.type==='billing_not_active')return 'billing_not_active';}catch{}
  }else await response.body?.cancel();
  return ({401:'upstream_authentication_failed',403:'upstream_access_denied',429:'upstream_rate_limited'})[response.status]||'upstream_rejected';
}
export function createGateway({config,tokenProvider,fetchImpl=fetch,now=Date.now,log=()=>{}}) {
  let inFlight=0,blockedUntil=0,blockReason=null;
  const block=code=>{blockedUntil=now()+config.cooldownMs;blockReason=code;};
  const json=(res,status,value)=>{if(res.destroyed)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
  const failure=(res,status,code)=>json(res,status,{error:{code,message:code}});
  const server=http.createServer(async(req,res)=>{
    let url;try{url=new URL(req.url,'http://localhost');}catch{return failure(res,400,'invalid_url');}
    if(req.method==='GET'&&url.pathname==='/healthz')return json(res,200,{status:'ok'});
    const bearer=/^Bearer ([^\s]+)$/i.exec(req.headers.authorization||'')?.[1];
    if(!equal(bearer,config.token))return failure(res,401,'unauthorized');
    if(req.method==='GET'&&url.pathname==='/status')return json(res,200,{model:MODEL,authentication:'oauth',inFlight,maxConcurrency:config.concurrency,
      cooldownSeconds:Math.max(0,Math.ceil((blockedUntil-now())/1000)),lastFailure:blockReason});
    if(req.method!=='POST'||!PATHS.has(url.pathname)||url.search)return failure(res,404,'unsupported_operation');
    if(now()<blockedUntil){res.setHeader('retry-after',Math.ceil((blockedUntil-now())/1000));return failure(res,503,'upstream_cooldown');}
    if(inFlight>=config.concurrency){res.setHeader('retry-after','1');return failure(res,429,'gateway_busy');}
    inFlight++;
    const controller=new AbortController();let timedOut=false,disconnected=false,dispatched=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},config.timeoutMs);timer.unref();
    const abort=()=>{disconnected=true;controller.abort();};
    const close=()=>{if(!res.writableFinished)abort();};req.once('aborted',abort);res.once('close',close);
    const start=now();let status=500,code=null,verification=null;
    try{
      if(!String(req.headers['content-type']||'').startsWith('multipart/form-data'))throw error('multipart_required',415);
      const body=await parseAudio(await readUpload(req),req.headers['content-type']);
      const token=await tokenProvider.getAccessToken();
      if(controller.signal.aborted)throw error('request_cancelled',499);
      dispatched=true;
      const upstream=await fetchImpl(AUDIO_ENDPOINT,{method:'POST',headers:{authorization:'Bearer '+token,accept:'application/json'},body,redirect:'error',signal:controller.signal});
      const requestId=safeId(upstream.headers.get('x-request-id'));if(requestId)res.setHeader('x-request-id',requestId);
      if(!upstream.ok){
        code=await classifyResponse(upstream);status=upstream.status>=400?upstream.status:502;
        if([401,403,429].includes(status)||status>=500)block(code);
        const retry=upstream.headers.get('retry-after');if(retry&&/^\d{1,8}$/.test(retry))res.setHeader('retry-after',retry);
        return failure(res,status,code);
      }
      const data=await limitedJson(upstream,2*1024*1024);
      if(typeof data.text!=='string')throw error('invalid_transcript',502);
      const reported=typeof data.model==='string'&&data.model.trim()?data.model.trim():null;
      if(reported&&reported!==MODEL)throw error('unexpected_upstream_model',502);
      verification=reported?'upstream-reported':'unreported';status=200;
      res.setHeader('x-sub2api-model-verification',verification);
      res.setHeader('x-sub2api-transcription-model',reported||'upstream-selected');
      return json(res,200,{text:data.text,usage:data.usage??null,requestedModel:MODEL,reportedModel:reported,modelVerification:verification,provider:'codex-oauth'});
    }catch(e){
      if(disconnected){status=499;code='client_disconnected';return;}
      code=timedOut?'upstream_timeout':typeof e.code==='string'&&/^[a-z_]{1,100}$/.test(e.code)?e.code:'upstream_unavailable';
      status=Number.isInteger(e.status)?e.status:502;
      if(dispatched&&status>=500)block(code);
      failure(res,status,code);
    }finally{
      clearTimeout(timer);req.off('aborted',abort);res.off('close',close);inFlight--;
      log({type:'transcription',status,code,elapsedMs:now()-start,dispatched,modelVerification:verification});
    }
  });
  server.headersTimeout=15000;server.requestTimeout=config.timeoutMs+10000;server.maxHeadersCount=40;
  return server;
}
