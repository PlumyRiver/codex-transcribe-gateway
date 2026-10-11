import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';
import lockfile from 'proper-lockfile';
import {error} from './config.mjs';

export class CredentialStore {
  constructor(directory, key) {
    this.directory = directory;
    this.file = path.join(directory, 'credentials.enc');
    this.key = key;
    this.release = null;
    this.compromised = false;
  }
  async acquire() {
    await fs.mkdir(this.directory, {recursive:true, mode:0o700});
    if ((await fs.lstat(this.directory)).isSymbolicLink()) throw error('credential_directory_symlink');
    await fs.chmod(this.directory, 0o700);
    try {
      this.release = await lockfile.lock(this.file, {realpath:false, stale:30000, update:10000,
        onCompromised:()=>{this.compromised=true;}});
    } catch { throw error('credential_store_in_use'); }
  }
  assertOwner() {
    if (!this.release || this.compromised) throw error('credential_store_not_owned');
  }
  async read() {
    this.assertOwner();
    let bytes;
    try {
      if ((await fs.lstat(this.file)).isSymbolicLink()) throw error('credential_file_symlink');
      bytes = await fs.readFile(this.file);
    } catch (e) { if(e.code === 'ENOENT') throw error('login_required', 401); throw e; }
    try {
      const envelope = JSON.parse(bytes);
      if (envelope.version !== 1) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv,'base64'));
      decipher.setAAD(Buffer.from('codex-transcribe-gateway:v1'));
      decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]));
    } catch { throw error('credential_decryption_failed'); }
  }
  async write(credentials) {
    this.assertOwner();
    const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',this.key,iv);
    cipher.setAAD(Buffer.from('codex-transcribe-gateway:v1'));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(credentials)),cipher.final()]);
    const data=JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
    const temporary=this.file+'.'+randomBytes(8).toString('hex')+'.tmp';
    let handle;
    try {
      handle=await fs.open(temporary,'wx',0o600);
      await handle.writeFile(data);await handle.sync();await handle.close();handle=null;
      this.assertOwner();await fs.rename(temporary,this.file);await fs.chmod(this.file,0o600);
    } finally { await handle?.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{}); }
  }
  async close() { const release=this.release;this.release=null;if(release)await release().catch(()=>{}); }
}
