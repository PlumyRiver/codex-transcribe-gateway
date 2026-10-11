import {config} from './config.mjs';
import {CredentialStore} from './store.mjs';
import {createOAuth,createTokenProvider} from './oauth.mjs';
import {createGateway} from './gateway.mjs';
const settings=config(),store=new CredentialStore(settings.dataDir,settings.encryptionKey);
try{
  await store.acquire();await store.read();
  const tokenProvider=createTokenProvider(store,createOAuth());
  const server=createGateway({config:settings,tokenProvider,log:e=>console.log(JSON.stringify(e))});
  server.on('error',async()=>{await store.close();process.exitCode=1;});
  server.listen(settings.port,settings.host,()=>console.log('Transcription gateway ready on port '+settings.port));
  let stopping=false;
  async function stop(){if(stopping)return;stopping=true;server.closeIdleConnections();const deadline=setTimeout(()=>server.closeAllConnections(),5000);await new Promise(r=>server.close(r));clearTimeout(deadline);await tokenProvider.drain();await store.close();}
  process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
}catch(e){await store.close();console.error(e.code||'startup_failed');process.exitCode=1;}
