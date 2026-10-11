import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {config,error} from './config.mjs';
import {CredentialStore} from './store.mjs';
import {createOAuth,equal} from './oauth.mjs';

export function loginHandler({flow,oauth,store,expected={},now=Date.now,done=()=>{}}) {
  let state='waiting';
  const page=(res,status,message)=>{res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"});res.end('<!doctype html><meta charset="utf-8"><title>Transcribe OAuth</title><p>'+message+'</p>');};
  return async(req,res)=>{
    if(!['localhost:1455','127.0.0.1:1455','[::1]:1455'].includes(req.headers.host))return page(res,400,'Invalid callback host.');
    if(req.method!=='GET')return page(res,405,'GET required.');
    if(now()-flow.createdAt>600000)return page(res,410,'Login expired. Start a new login.');
    const url=new URL(req.url,'http://localhost:1455');
    if(url.pathname===flow.startPath&&state==='waiting'){res.writeHead(303,{location:flow.url,'cache-control':'no-store','referrer-policy':'no-referrer'});return res.end();}
    if(url.pathname!=='/auth/callback')return page(res,404,'Start from the URL printed in your terminal.');
    if(url.searchParams.getAll('state').length!==1||!equal(url.searchParams.get('state'),flow.state))return page(res,400,'State mismatch. No credentials were saved.');
    if(state!=='waiting')return page(res,409,'This callback was already handled.');
    if(url.searchParams.has('error')){state='cancelled';res.once('finish',()=>done(false,'oauth_cancelled'));return page(res,400,'Authorization was not completed.');}
    if(url.searchParams.getAll('code').length!==1||!url.searchParams.get('code'))return page(res,400,'Missing authorization code.');
    state='exchanging';
    try{
      const credentials=await oauth.exchange(flow,url.searchParams.get('code'),expected);
      await store.write(credentials);state='complete';res.once('finish',()=>done(true));page(res,200,'Authorization saved securely. You can close this page and start the gateway.');
    }catch(e){state='failed';const code=/^(oauth|credential)_[a-z_]{1,80}$/.test(e.code||'')?e.code:'credential_save_failed';res.once('finish',()=>done(false,code));page(res,400,'Authorization could not be verified or saved. Check the safe error category in your terminal, not this URL.');}
  };
}
export async function main() {
  const settings=config(),store=new CredentialStore(settings.dataDir,settings.encryptionKey);await store.acquire();
  let server,timer;
  try{
    const oauth=createOAuth(),flow=await oauth.prepare();
    const result=await new Promise((resolve,reject)=>{
      server=http.createServer(loginHandler({flow,oauth,store,expected:{expectedEmail:settings.expectedEmail,expectedWorkspace:settings.expectedWorkspace},done:(ok,code)=>resolve({ok,code})}));
      server.once('error',()=>reject(error('oauth_callback_port_unavailable')));
      server.listen(1455,process.env.OAUTH_BIND_HOST||'127.0.0.1',()=>console.log('Open locally: http://localhost:1455'+flow.startPath));
      timer=setTimeout(()=>resolve({ok:false,code:'oauth_flow_expired'}),600000);
    });
    if(!result.ok)throw error(result.code||'oauth_login_not_completed',401);
    console.log('OAuth saved. This does not by itself prove transcription entitlement.');
  }finally{clearTimeout(timer);if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.code||'login_failed');process.exitCode=1;});
