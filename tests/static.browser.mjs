import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright';
import {run} from '../src/process.mjs';
import {ROOT} from '../src/library.mjs';
import {loadNodeFlite} from '../src/flite-node.mjs';
import {synthesizeSpeech} from '../src/flite.mjs';
import {speechBounds} from '../src/speech-timing.mjs';

test('static GUI exports speech, music and spinning endcard even when video playback is denied', {timeout:180000},async t=>{
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
 const browser=await chromium.launch({headless:true,...(process.env.THEATRE_TEST_CHROMIUM?{executablePath:process.env.THEATRE_TEST_CHROMIUM}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 t.after(()=>browser.close());
 const page=await browser.newPage({acceptDownloads:true});const unexpected=[],errors=[];
 // Reproduce the reported Safari policy rejection while leaving canvas capture,
 // real JPEG decoding, Web Audio and the actual MediaRecorder untouched.
 await page.addInitScript(()=>{
  window.endcardPlayCalls=0;
  HTMLVideoElement.prototype.play=function(){window.endcardPlayCalls++;return Promise.reject(new DOMException('Playback denied','NotAllowedError'));};
 });
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().startsWith('http')&&(!r.url().startsWith(origin+'/')||r.url().includes('/api/')))unexpected.push(r.url());});
 await page.goto(origin+'/');await page.waitForFunction(()=>document.querySelector('#template').options.length>0);
 assert.equal(await page.locator('#page-previews img').count(),0,'no source images load before selection');
 // Exercise packaged authoring inputs under a subdirectory before the real export.
 await page.locator('#load-example').click();
 await page.waitForFunction(()=>document.querySelector('#editor-status').textContent.startsWith('Example loaded.'));
 const example=JSON.parse(await page.locator('#script-json').inputValue());
 assert.deepEqual(example,JSON.parse(await fs.readFile(path.join(ROOT,'templates/book-duet.example.json'),'utf8')));
 await page.locator('#random-page-0').click();
 const rerolled=JSON.parse(await page.locator('#script-json').inputValue());
 assert.notEqual(rerolled.comics[0],example.comics[0]);
 assert.deepEqual(rerolled.lines.map(line=>line.text),example.lines.map(line=>line.text));
 assert.equal(rerolled.seed,example.seed);
 const blankDownload=page.waitForEvent('download');
 await page.getByRole('link',{name:'Download blank JSON template'}).click();
 const blank=await blankDownload;
 assert.equal(blank.suggestedFilename(),'blank-book-duet.json');
 assert.deepEqual(JSON.parse(await fs.readFile(await blank.path(),'utf8')),JSON.parse(await fs.readFile(path.join(ROOT,'templates/blank-book-duet.json'),'utf8')));
 const script=JSON.parse(await fs.readFile(path.join(ROOT,'examples/parasite.json'),'utf8'));
 script.title='Static export proof';script.lines=[{speaker:'reader',text:'An inside source.',comic:script.comics[0],shot:'two-shot'},{speaker:'friend',text:'I have my doubts.',comic:script.comics[0],emotion:'skeptical',shot:'speaker'}];script.endCard={enabled:true,seconds:1};
 await page.locator('#script-json').fill(JSON.stringify(script));await page.locator('#apply-json').click();
 await page.waitForFunction(count=>{const images=[...document.querySelectorAll('#page-previews img')];return images.length===count&&images.every(i=>i.complete&&i.naturalWidth>0);},script.comics.length);
 assert.ok(await page.locator('#page-previews img').evaluateAll((images,mount)=>images.every(i=>i.src.startsWith(mount+'/assets/')),origin),'only selected source previews load beneath the application mount');
 // A bounded, real six-second mono WAV; the known tone lets the exported end
 // card prove the GUI's File reached the mixer without a second GPU export.
 const rate=16000,frames=rate*6,music=Buffer.alloc(44+frames*2);
 music.write('RIFF',0);music.writeUInt32LE(music.length-8,4);music.write('WAVEfmt ',8);
 music.writeUInt32LE(16,16);music.writeUInt16LE(1,20);music.writeUInt16LE(1,22);
 music.writeUInt32LE(rate,24);music.writeUInt32LE(rate*2,28);music.writeUInt16LE(2,32);music.writeUInt16LE(16,34);
 music.write('data',36);music.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)music.writeInt16LE(Math.round(2000*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
 const attachment={name:'quiet-tone.wav',mimeType:'audio/wav',buffer:music};
 await page.locator('#background-music').setInputFiles(attachment);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#title').value==='Static export proof');
 assert.equal(await page.locator('#background-music').evaluate(input=>input.files.length),0,'music is reselected after reload');
 await page.locator('#validate').click();await page.waitForFunction(()=>document.querySelector('#editor-status').textContent.includes('validation passed'));
 await page.locator('#background-music').setInputFiles(attachment);
 assert.doesNotMatch(await page.evaluate(()=>JSON.stringify(localStorage)),/quiet-tone\.wav/,'music remains outside saved JSON');
 await page.locator('#generate').click();
 await page.waitForFunction(()=>/Ready —|failed|cancelled/.test(document.querySelector('#jobs').textContent),{},{timeout:120000});
 const status=await page.locator('#jobs').innerText();assert.match(status,/Ready —/,status+'\n'+errors.join('\n'));
 assert.equal(await page.evaluate(()=>window.endcardPlayCalls),0,'browser endcard must not depend on video playback permission');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:/^Download video \((MP4|WEBM)\)$/}).click();const download=await downloadPromise;
 const film=path.join(os.tmpdir(),'comic-static-proof'+path.extname(download.suggestedFilename()));await download.saveAs(film);
 const probe=JSON.parse((await run(process.env.FFPROBE??'ffprobe',['-v','error','-show_streams','-show_format','-of','json',film])).toString());
 assert.ok(probe.streams.some(s=>s.codec_type==='video'));assert.ok(probe.streams.some(s=>s.codec_type==='audio'));
 await run(process.env.FFMPEG??'ffmpeg',['-v','error','-i',film,'-f','null','-'],{timeout:60000});
 const pcm=await run(process.env.FFMPEG??'ffmpeg',['-v','error','-i',film,'-vn','-f','s16le','-ac','1','-ar','8000','pipe:1']);
 let expected=script.endCard.seconds;const module=await loadNodeFlite();
 for(const line of script.lines){const take=await synthesizeSpeech(module,line.text,{speaker:line.speaker});const [start,end]=speechBounds(take.samples,take.sampleRate);expected+=(end-start)/take.sampleRate;}
 assert.ok(pcm.length/16000>=expected-.08,'complete trimmed speech and end card duration');
 assert.ok(pcm.length/16000<expected+1,`browser recording padding stays bounded around ${expected}s; got ${pcm.length/16000}s`);
 let peak=0;for(let i=0;i<pcm.length;i+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(i)));assert.ok(peak>1000,'audible captured speech');
 // Sample inside the one-second end card after measured speech ends.
 // Measure the attached 220Hz tone there; silence or an ignored File must fail.
 let sine=0,cosine=0;const start=Math.floor((expected-.5)*8000),samples=1600;
 for(let i=0;i<samples;i++){const value=pcm.readInt16LE((start+i)*2),angle=2*Math.PI*220*i/8000;sine+=value*Math.sin(angle);cosine+=value*Math.cos(angle);}
 assert.ok(2*Math.hypot(sine,cosine)/samples>500,'attached music is audible during the end card');
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(os.tmpdir(),'comic-static-gui.png'),fullPage:true});
 t.diagnostic(`Real film: ${film}; decoded ${(pcm.length/16000).toFixed(2)} seconds; peak ${peak}`);
 await fs.rm(out,{recursive:true,force:true});
});
