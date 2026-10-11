import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const repository='https://github.com/Wei-Shaw/sub2api.git',commit='2f3fed2fdb0787141294cec81487a5df30426f7f';
const directory=path.resolve('upstream'),patch=path.resolve('patches/sub2api-transcription.patch');
const git=(args,cwd=directory)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
try{
  try{await fs.access(directory);throw Error('upstream already exists; inspect or choose a fresh clone instead of resetting it');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.mkdir(directory);git(['init']);git(['remote','add','origin',repository]);
  git(['fetch','--depth=1','origin',commit]);git(['checkout','--detach','FETCH_HEAD']);
  if(git(['rev-parse','HEAD']).trim()!==commit)throw Error('Upstream commit mismatch');
  git(['apply','--check',patch]);git(['apply',patch]);git(['diff','--check']);
  console.log('Pinned Sub2API source prepared and transcription-only patch applied. No credentials were imported.');
}catch(e){console.error(e.message?.split('\n')[0]||'prepare_failed');process.exitCode=1;}
