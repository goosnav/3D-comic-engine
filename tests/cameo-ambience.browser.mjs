import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
import {ROOT} from '../src/library.mjs';
import {run} from '../src/process.mjs';
import {startServer} from '../src/server.mjs';
import {inWorkspace} from './workspace-controls.mjs';

test('cameo and ambience controls round-trip in local and hosted GUI; hosted export records real animation and audio',{timeout:240000},async t=>{
 await run(process.execPath,['tools/build-web.mjs'],{timeout:60000});
 const root=path.join(ROOT,'dist'),server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://local'),p=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!p.startsWith(root+path.sep))throw Error();
  res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await fs.readFile(p));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const local=await startServer({port:0});t.after(()=>local.close());
 const browser=await chromium.launch({headless:true,chromiumSandbox:true,args:['--autoplay-policy=no-user-gesture-required']});t.after(()=>browser.close());
 const example=JSON.parse(await fs.readFile(path.join(ROOT,'examples/awkward-cameo.json')));example.output={width:192,height:320,fps:12};
 for(const [mode,url]of [['local',local.url],['hosted',`http://127.0.0.1:${server.address().port}`]]){
  const page=await browser.newPage({acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#next-step').disabled);
  await (await inWorkspace(page.locator('#script-json'))).fill(JSON.stringify(example));await page.locator('#apply-json').click();
  await (await inWorkspace(page.locator('#line-1-camera'))).selectOption('follow');await page.locator('#line-1-behaviour').selectOption('walk');await page.locator('#line-1-seconds').fill('2.5');
  await page.locator('#add-cameo').click();assert.equal(await page.locator('#line-5-camera').inputValue(),'static');await page.getByRole('button',{name:'Remove line 6',exact:true}).click();
  await (await inWorkspace(page.locator('#ambience-mode'))).selectOption('room');await page.locator('#ambience-volume').focus();await page.locator('#ambience-volume').press('ArrowRight');
  let script=JSON.parse(await page.locator('#script-json').inputValue());assert.deepEqual(script.lines[1],{cameo:'goose',behaviour:'walk',camera:'follow',seconds:2.5});assert.deepEqual(script.ambience,{mode:'room',volume:.4});
  await page.locator('#ambience-mode').selectOption('off');assert.equal(await page.locator('#ambience-volume').isDisabled(),true);await page.locator('#ambience-mode').selectOption('laundromat');
  // Restore static goose, keeping a separate tracking shot of the walker.
  await (await inWorkspace(page.locator('#line-1-camera'))).selectOption('static');await page.locator('#line-1-behaviour').selectOption('stand');await page.locator('#line-1-seconds').fill('2');
  await (await inWorkspace(page.locator('#ambience-mode'))).selectOption('laundromat');
  script=JSON.parse(await page.locator('#script-json').inputValue());
  await (await inWorkspace(page.locator('#script-json'))).fill(JSON.stringify(script));await page.locator('#apply-json').click();
  assert.deepEqual(JSON.parse(await page.locator('#script-json').inputValue()).ambience,{mode:'laundromat',volume:.4});
  if(mode==='hosted'){
   await (await inWorkspace(page.locator('#generate'))).click();await page.waitForFunction(()=>/Ready —|failed|cancelled/.test(document.querySelector('#jobs').textContent),null,{timeout:180000});assert.match(await page.locator('#jobs').innerText(),/Ready —/);
   const wait=page.waitForEvent('download');await page.getByRole('link',{name:/^Download video/}).click();const download=await wait;
   const out=path.join(ROOT,'output/cameo-acceptance');await fs.mkdir(out,{recursive:true});const file=path.join(out,'browser'+path.extname(download.suggestedFilename()));await download.saveAs(file);
   const probe=JSON.parse(await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));const video=probe.streams.find(s=>s.codec_type==='video');assert.equal(video.width,192);assert.equal(video.height,320);assert.ok(probe.streams.some(s=>s.codec_type==='audio'));
   await run('ffmpeg',['-v','error','-i',file,'-f','null','-']);
   const pcm=await run('ffmpeg',['-v','error','-ss','2','-t','1','-i',file,'-vn','-ar','8000','-ac','1','-f','f32le','pipe:1']);let sum=0;for(let i=0;i<pcm.length;i+=4)sum+=pcm.readFloatLE(i)**2;const rms=Math.sqrt(sum/(pcm.length/4));assert.ok(rms>.001&&rms<.03,`quiet audible ambience during cameo: ${rms}`);
   console.log(JSON.stringify({file,width:192,height:320,duration:probe.format.duration,ambienceRMS:rms,sandbox:true}));
  }
  assert.deepEqual(errors,[]);await page.close();
 }
});
