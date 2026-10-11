import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if(!files.length)throw Error('Stage the intended source files before scanning.');
const rules=[['private-path',/\/Users\/|\/home\/[A-Za-z0-9_-]+\//],['credential-like',/\b(?:sk-proj-|sk-live-|ghp_|gho_)[A-Za-z0-9_-]{20,}/],['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['personal-email',/[A-Z0-9._%+-]+@(?:gmail|hotmail|yahoo|outlook)\.com/i],['deployment-address',/\.sslip\.io|\.a\.run\.app|subtitle-translate-[a-f0-9]{6}/]];
let failures=0;
for(const file of files){
  if(/(?:^|\/)(?:\.env$|auth\.json$|credentials\.enc$|data\/|private\/|node_modules\/|upstream\/)|\.(?:wav|mp3|m4a|webm|log|zip|enc)$/.test(file)){console.error('Forbidden tracked file: '+file);failures++;continue;}
  const info=await fs.lstat(file);if(info.isSymbolicLink()){console.error('Tracked symlink: '+file);failures++;continue;}
  if(info.size>1024*1024){console.error('Unexpected large file: '+file);failures++;continue;}
  const text=await fs.readFile(file,'utf8');
  // This scanner's own regex rules are not deployment data.
  if(file=== 'scripts/scan-public.mjs')continue;
  for(const [name,pattern]of rules)if(pattern.test(text)){console.error(name+': '+file);failures++;}
}
if(failures)process.exitCode=1;else console.log('Checked '+files.length+' tracked source files; no forbidden files or configured secret patterns found.');
