import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright';
import {run} from '../src/process.mjs';
import {ROOT} from '../src/library.mjs';

test('static GUI exports full on-device film with audio, restores input, and never calls an API', {timeout:180000},async t=>{
 const out=await fs.mkdtemp(path.join(os.tmpdir(),'comic-static-e2e-'));
 await run(process.execPath,['tools/build-web.mjs','--out-dir',out],{timeout:60000});
 const server=http.createServer(async(req,res)=>{
  try{
   const pathname=new URL(req.url,'http://local').pathname;
   if(!pathname.startsWith('/studio/'))throw Error('only the mounted application is public');
   const p=path.resolve(out,'.'+pathname.slice('/studio'.length));
   if(p!==out&&!p.startsWith(out+path.sep))throw Error('outside');
   const file=p===out?path.join(out,'index.html'):p;
   res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.wasm')?'application/wasm':file.endsWith('.mp4')?'video/mp4':'application/octet-stream');
   res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const origin=`http://127.0.0.1:${server.address().port}/studio`;
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 t.after(()=>browser.close());
 const page=await browser.newPage({acceptDownloads:true});const unexpected=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().startsWith('http')&&(!r.url().startsWith(origin+'/')||r.url().includes('/api/')))unexpected.push(r.url());});
 await page.goto(origin+'/');await page.waitForFunction(()=>document.querySelector('#template').options.length>0);
 await page.waitForFunction(()=>[...document.querySelectorAll('#gallery img')].every(i=>i.complete));
 assert.ok(await page.locator('#gallery img').evaluateAll(images=>images.length===3&&images.every(i=>i.naturalWidth>0)),'source thumbnails load beneath the application mount');
 const script=JSON.parse(await fs.readFile(path.join(ROOT,'examples/parasite.json'),'utf8'));
 script.title='Static export proof';script.lines=[{speaker:'reader',text:'An inside source.',comic:script.comics[0],shot:'two-shot'},{speaker:'friend',text:'I have my doubts.',comic:script.comics[0],emotion:'skeptical',shot:'speaker'}];script.endCard={enabled:true,seconds:1};
 await page.locator('#script-json').fill(JSON.stringify(script));await page.locator('#apply-json').click();
 await page.reload();await page.waitForFunction(()=>document.querySelector('#title').value==='Static export proof');
 await page.locator('#validate').click();await page.waitForFunction(()=>document.querySelector('#editor-status').textContent.includes('validation passed'));
 await page.locator('#generate').click();
 await page.waitForFunction(()=>/Ready —|failed|cancelled/.test(document.querySelector('#jobs').textContent),{},{timeout:120000});
 const status=await page.locator('#jobs').innerText();assert.match(status,/Ready —/,status+'\n'+errors.join('\n'));
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download video',exact:true}).click();const download=await downloadPromise;
 const film=path.join(os.tmpdir(),'comic-static-proof'+path.extname(download.suggestedFilename()));await download.saveAs(film);
 const probe=JSON.parse((await run(process.env.FFPROBE??'ffprobe',['-v','error','-show_streams','-show_format','-of','json',film])).toString());
 assert.ok(probe.streams.some(s=>s.codec_type==='video'));assert.ok(probe.streams.some(s=>s.codec_type==='audio'));
 await run(process.env.FFMPEG??'ffmpeg',['-v','error','-i',film,'-f','null','-'],{timeout:60000});
 const pcm=await run(process.env.FFMPEG??'ffmpeg',['-v','error','-i',film,'-vn','-f','s16le','-ac','1','-ar','8000','pipe:1']);
 assert.ok(pcm.length>4*8000*2,'complete speech and end card duration');
 assert.ok(pcm.length/16000<5.3,`browser recording padding must stay bounded around the 4.238-second script; got ${pcm.length/16000}s`);
 let peak=0;for(let i=0;i<pcm.length;i+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(i)));assert.ok(peak>1000,'audible captured speech');
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(os.tmpdir(),'comic-static-gui.png'),fullPage:true});
 t.diagnostic(`Real film: ${film}; decoded ${(pcm.length/16000).toFixed(2)} seconds; peak ${peak}`);
 await fs.rm(out,{recursive:true,force:true});
});
