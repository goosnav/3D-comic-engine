#!/usr/bin/env node
// Bootstrap uses Node builtins so a fresh checkout can run it before npm ci.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const help=`Comic Theatre desktop setup
Usage: node tools/setup.mjs [--check]
Prerequisites: Node 22.12+ and npm (https://nodejs.org/), FFmpeg and ffprobe on PATH.
First run installs pinned npm packages and Playwright Chromium; internet is required.
Later runs reuse them. --check verifies the installation without downloading anything.
No administrator permission, Python, speech model or paid service is required.
Linux may need Chromium system libraries installed by your system administrator.
Optional paths: FFMPEG, FFPROBE, THEATRE_BROWSER. See launchers/README.md.
`;
const log=message=>console.error(message);
function command(program,args,{timeout=120000,shell=false}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(program,args,{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true,shell});
  const timer=setTimeout(()=>{child.kill();reject(Error(`${program} timed out; rerun setup to retry.`));},timeout);
  child.stdout.on('data',b=>process.stderr.write(b));child.stderr.on('data',b=>process.stderr.write(b));
  child.once('error',error=>{clearTimeout(timer);reject(Error(`${program}: ${error.message}. Check installation and PATH.`));});
  child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`${program} exited ${code}; setup did not complete.`));});
 });
}
async function dependenciesPresent(pkg){
 for(const [name,version] of Object.entries(pkg.dependencies??{})){
  try{if(JSON.parse(await fs.readFile(path.join(root,'node_modules',name,'package.json'),'utf8')).version!==version)return false;}catch{return false;}
 }
 return true;
}
try{
 const args=process.argv.slice(2);
 if(args.includes('--help')||args.includes('-h'))console.log(help);
 else{
  if(args.some(a=>a!=='--check'))throw Error('Unknown setup option. Use --help or --check.');
  const check=args.includes('--check'),[major,minor]=process.versions.node.split('.').map(Number);
  if(major<22||major===22&&minor<12)throw Error('Install Node 22.12 or newer with npm from https://nodejs.org/ and rerun this launcher.');
  log(`Checking desktop prerequisites (Node ${process.versions.node})`);
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  // Only fixed npm arguments reach the Windows command shell; no user paths.
  const npmOptions={shell:process.platform==='win32',timeout:900000};
  await command(npm,['--version'],npmOptions);
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const lock=await fs.readFile(path.join(root,'package-lock.json'));
  const fingerprint=createHash('sha256').update(lock).update(`${process.platform}/${process.arch}/${major}`).digest('hex');
  const stamp=path.join(root,'.cache/setup.json');let installed;
  try{installed=JSON.parse(await fs.readFile(stamp,'utf8')).fingerprint===fingerprint;}catch{}
  const present=await dependenciesPresent(pkg);
  if(check&&!present)throw Error('npm packages are missing or changed. Run node tools/setup.mjs to install them.');
  if(!check&&(!installed||!present)){
   log('Installing pinned npm dependencies (download required on first run)…');
   await command(npm,['ci','--no-audit','--no-fund'],npmOptions);
  }
  for(const [variable,fallback] of [['FFMPEG','ffmpeg'],['FFPROBE','ffprobe']]){
   try{await command(process.env[variable]??fallback,['-version']);}
   catch(error){throw Error(`${error.message}\nInstall FFmpeg including ffprobe, add its bin directory to PATH, or set FFMPEG and FFPROBE to executable paths. See launchers/README.md.`);}
  }
  const {chromium}=await import('playwright');
  const executable=process.env.THEATRE_BROWSER??chromium.executablePath();
  try{await fs.access(executable);}catch{
   if(check||process.env.THEATRE_BROWSER)throw Error('Chromium is missing. Run node tools/setup.mjs, or correct THEATRE_BROWSER.');
   log('Installing Chromium for this user (download required on first run)…');
   await command(process.execPath,[path.join(root,'node_modules/playwright/cli.js'),'install','chromium'],{timeout:900000});
  }
  let browser;
  try{browser=await chromium.launch({headless:true,timeout:30000,...(process.env.THEATRE_BROWSER?{executablePath:process.env.THEATRE_BROWSER}:{})});}
  catch(error){throw Error(`Chromium cannot start: ${error.message}\nOn Linux, install the missing system libraries through your normal system package manager. Setup never requests administrator access.`);}
  finally{if(browser)await browser.close();}
  await WebAssembly.compile(await fs.readFile(path.join(root,'node_modules/@echogarden/flite-wasi/flite.wasm')));
  if(!check){await fs.mkdir(path.dirname(stamp),{recursive:true});await fs.writeFile(stamp,JSON.stringify({fingerprint,completed:new Date().toISOString()})+'\n');}
  log('Desktop setup ready: Chromium, FFmpeg and bundled Flite speech. No speech model needed.');
 }
}catch(error){console.error(`Setup failed: ${error.message}`);process.exitCode=1;}
