import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {ROOT,loadCatalog,verifyCatalog} from '../src/library.mjs';
import {getExampleLibrary} from '../src/example-library.mjs';
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--out-dir'))throw Error('Usage: node tools/build-web.mjs [--out-dir DIRECTORY]');
const out=path.resolve(args[1]??path.join(ROOT,'dist'));
// No recursive delete: builds only write their explicit public-file allowlist.
await fs.mkdir(out,{recursive:true});
const catalog=await loadCatalog();await verifyCatalog(catalog);
const exampleLibrary=await getExampleLibrary({catalog});
const exampleFiles=['examples/index.json',...exampleLibrary.index.examples.map(example=>example.path)];
const assetFiles=new Set(['assets/catalog.json',...Object.values(catalog.assets).map(e=>e.path),...catalog.comics.map(e=>e.path),'assets/fonts/NOTICE.txt']);
const templateFiles=['blank-book-duet.json','book-duet.example.json','fireside.example.json','page-tour.example.json','astronaut.example.json'].map(name=>'templates/'+name);
const publicFiles=new Set([...assetFiles,...templateFiles,...exampleFiles,'index.html','style.css','app.mjs','browser/backend.mjs','browser/export.mjs','browser/voice-worker.mjs','vendor/flite.wasm','vendor/FLITE-COPYING.txt','vendor/WASI-LICENSE.txt','vendor/THREE-LICENSE.txt','NOTICES.md']);
const publicDirs=new Set([...publicFiles].flatMap(p=>{const a=p.split('/');return a.slice(0,-1).map((_,i)=>a.slice(0,i+1).join('/'));}));
async function verifyDestination(dir,relative=''){
 if((await fs.lstat(dir)).isSymbolicLink())throw Error('Static output must not contain symlinks');
 for(const e of await fs.readdir(dir,{withFileTypes:true})){
  const name=relative?relative+'/'+e.name:e.name;
  if(e.isSymbolicLink()||!(e.isDirectory()?publicDirs:publicFiles).has(name))throw Error(`Unexpected/unrelated file in static output: ${name}. Preserve it elsewhere or choose an empty --out-dir; nothing is deleted automatically.`);
  if(e.isDirectory())await verifyDestination(path.join(dir,e.name),name);
 }
}
await verifyDestination(out);
for(const file of [...assetFiles,...templateFiles]){
 const dest=path.join(out,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(ROOT,file),dest);
}
await fs.mkdir(path.join(out,'examples'),{recursive:true});
await fs.writeFile(path.join(out,'examples/index.json'),JSON.stringify(exampleLibrary.index,null,2)+'\n');
for(const [name,bytes]of exampleLibrary.files)await fs.writeFile(path.join(out,'examples',name),bytes);
const html=(await fs.readFile(path.join(ROOT,'web/index.html'),'utf8')).replace('name="theatre-runtime" content="desktop"','name="theatre-runtime" content="browser"');
await fs.writeFile(path.join(out,'index.html'),html);
await fs.copyFile(path.join(ROOT,'web/style.css'),path.join(out,'style.css'));
await fs.mkdir(path.join(out,'vendor'),{recursive:true});
await fs.copyFile(path.join(ROOT,'node_modules/@echogarden/flite-wasi/flite.wasm'),path.join(out,'vendor/flite.wasm'));
for(const [source,target]of [['@echogarden/flite-wasi/COPYING','FLITE-COPYING.txt'],['@bjorn3/browser_wasi_shim/LICENSE-MIT','WASI-LICENSE.txt'],['three/LICENSE','THREE-LICENSE.txt']]){
 await fs.copyFile(path.join(ROOT,'node_modules',source),path.join(out,'vendor',target));
}
await build({absWorkingDir:ROOT,entryPoints:{app:'web/app.mjs','browser/backend':'browser/backend.mjs','browser/export':'browser/export.mjs'},outdir:out,outExtension:{'.js':'.mjs'},bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:false});
// Worker builds do not share main-thread chunks, avoiding import-map assumptions.
try{await fs.access(path.join(ROOT,'browser/voice-worker.mjs'));await build({absWorkingDir:ROOT,entryPoints:['browser/voice-worker.mjs'],outfile:path.join(out,'browser/voice-worker.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022'});}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.copyFile(path.join(ROOT,'NOTICES.md'),path.join(out,'NOTICES.md'));
async function check(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await check(p);else if((await fs.stat(p)).size>25*1024*1024)throw Error(`${p}: exceeds static hosting 25 MiB per-file limit`);}}
await check(out);console.log(`Static on-device app: ${out}`);
