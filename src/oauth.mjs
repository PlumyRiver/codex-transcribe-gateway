import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {createLocalJWKSet, jwtVerify} from 'jose';
import {ISSUER, CLIENT_ID, REDIRECT_URI, error} from './config.mjs';

export function equal(a,b) {
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a),y=Buffer.from(b);return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);
}
export async function limitedJson(response, max=1024*1024) {
  let size=0;const chunks=[];
  if(!response.body)throw error('empty_upstream_response',502);
  for await(const chunk of response.body){size+=chunk.length;if(size>max){throw error('upstream_response_too_large',502);}chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks));}catch{throw error('invalid_upstream_json',502);}
}
function authUrl(value) {
  const url=new URL(value);
  if(url.origin!==ISSUER||url.username||url.password||url.hash||url.search)throw error('invalid_oauth_discovery');
  return url.toString();
}
export function createOAuth({fetchImpl=fetch, now=Date.now}={}) {
  let metadataPromise;
  async function metadata() {
    metadataPromise ||= (async()=>{
      const response=await fetchImpl(ISSUER+'/.well-known/openid-configuration',{redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw error('oauth_discovery_unavailable');
      const m=await limitedJson(response);
      if(m.issuer!==ISSUER)throw error('unexpected_oauth_issuer');
      return {issuer:m.issuer,authorization:authUrl(m.authorization_endpoint),token:authUrl(m.token_endpoint),jwks:authUrl(m.jwks_uri)};
    })().catch(e=>{metadataPromise=null;throw e;});
    return metadataPromise;
  }
  async function prepare() {
    const m=await metadata(),verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url');
    const url=new URL(m.authorization);
    url.search=new URLSearchParams({response_type:'code',client_id:CLIENT_ID,redirect_uri:REDIRECT_URI,
      scope:'openid profile email offline_access',state,nonce,code_challenge_method:'S256',
      code_challenge:createHash('sha256').update(verifier).digest('base64url'),id_token_add_organizations:'true',codex_cli_simplified_flow:'true',prompt:'login'}).toString();
    return {url:url.toString(),verifier,state,nonce,createdAt:now(),startPath:'/login/'+randomBytes(24).toString('hex')};
  }
  async function token(parameters) {
    const m=await metadata();
    const r=await fetchImpl(m.token,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,...parameters})});
    if(!r.ok){await r.body?.cancel();throw error('oauth_token_rejected',401);}
    return limitedJson(r);
  }
  async function normalize(tokens,{nonce,previous,expectedEmail='',expectedWorkspace=''}={}) {
    if(typeof tokens.access_token!=='string'||!tokens.access_token||!Number.isFinite(tokens.expires_in)||tokens.expires_in<60||tokens.expires_in>31*86400)throw error('invalid_oauth_token_response');
    let identity=previous?.identity;
    if(tokens.id_token){
      const m=await metadata(),r=await fetchImpl(m.jwks,{redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw error('oauth_jwks_unavailable');
      let payload;
      try { ({payload}=await jwtVerify(tokens.id_token,createLocalJWKSet(await limitedJson(r)),
        {issuer:ISSUER,audience:CLIENT_ID,algorithms:['RS256'],requiredClaims:['exp','iat','sub'],currentDate:new Date(now())})); }
      catch { throw error('oauth_identity_verification_failed',401); }
      if(nonce&&!equal(payload.nonce,nonce))throw error('oauth_nonce_mismatch',401);
      const account=payload['https://api.openai.com/auth']||{};
      if(!payload.sub||!account.chatgpt_account_id)throw error('oauth_account_missing',401);
      identity={subject:payload.sub,workspace:account.chatgpt_account_id,email:typeof payload.email==='string'?payload.email:''};
    } else if(!previous)throw error('oauth_identity_token_missing',401);
    if(!identity||previous&&(identity.subject!==previous.identity.subject||identity.workspace!==previous.identity.workspace))throw error('oauth_account_changed',401);
    if(expectedEmail&&identity.email.toLowerCase()!==expectedEmail.toLowerCase()||expectedWorkspace&&identity.workspace!==expectedWorkspace)throw error('oauth_account_mismatch',401);
    const refreshToken=tokens.refresh_token||previous?.refreshToken;
    if(typeof refreshToken!=='string'||!refreshToken)throw error('oauth_refresh_token_missing');
    return {version:1,accessToken:tokens.access_token,refreshToken,identity,expiresAt:now()+tokens.expires_in*1000};
  }
  async function exchange(flow,code,expected={}) {
    if(now()-flow.createdAt>600000)throw error('oauth_flow_expired',401);
    return normalize(await token({grant_type:'authorization_code',code,code_verifier:flow.verifier,redirect_uri:REDIRECT_URI}),{nonce:flow.nonce,...expected});
  }
  async function refresh(previous) { return normalize(await token({grant_type:'refresh_token',refresh_token:previous.refreshToken}),{previous}); }
  return {prepare,exchange,refresh};
}

export function createTokenProvider(store,oauth,{now=Date.now}={}) {
  let refreshing=null,blockedUntil=0;
  return {
    async drain() { await refreshing?.catch(()=>{}); },
    async getAccessToken() {
      store.assertOwner();
      if(now()<blockedUntil)throw error('oauth_refresh_cooldown',401);
      const current=await store.read();
      if(current.expiresAt>now()+60000)return current.accessToken;
      refreshing ||= (async()=>{
        const latest=await store.read();if(latest.expiresAt>now()+60000)return latest.accessToken;
        const next=await oauth.refresh(latest);await store.write(next);return next.accessToken;
      })().catch(e=>{blockedUntil=now()+300000;throw e;}).finally(()=>{refreshing=null;});
      return refreshing;
    }
  };
}
