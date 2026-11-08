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

test('digital look and quality controls round-trip locally and hosted, portable job retains them, and High records playable video',{timeout:240000},async t=>{
 await run(process.execPath,['tools/build-web.mjs'],{timeout:60000});
 const root=path.join(ROOT,'dist'),server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://local'),p=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!p.startsWith(root+path.sep))throw Error();
  res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await fs.readFile(p));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const local=await startServer({port:0});t.after(()=>local.close());
 const browser=await chromium.launch({headless:true,chromiumSandbox:true,args:['--autoplay-policy=no-user-gesture-required']});t.after(()=>browser.close());
 const example={template:'conversation',title:'Digital quality',seed:4,lines:[{speaker:'reader',text:'Hello.'},{speaker:'friend',seconds:1}],output:{width:192,height:320,fps:12}};
 for(const [mode,url]of [['local',local.url],['hosted',`http://127.0.0.1:${server.address().port}`]]){
  const page=await browser.newPage({acceptDownloads:true}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#next-step').disabled);
  await (await inWorkspace(page.locator('#script-json'))).fill(JSON.stringify(example));await page.locator('#apply-json').click();
  assert.equal(await (await inWorkspace(page.locator('#cartoon-enabled'))).isChecked(),false);
  await page.locator('#cartoon-enabled').check();await page.locator('#cartoon-pixelSize').fill('6');await page.locator('#cartoon-pixelSize').dispatchEvent('change');await page.locator('#cartoon-outline').fill('1.2');await page.locator('#cartoon-outline').dispatchEvent('change');await page.locator('#cartoon-shades').selectOption('6');await page.locator('#render-quality').selectOption('ultra');
  let script=JSON.parse(await page.locator('#script-json').inputValue());assert.deepEqual(script.cartoon,{enabled:true,pixelSize:6,outline:1.2,shades:6});assert.equal(script.renderQuality,'ultra');assert.match(await page.locator('#render-quality-help').innerText(),/Blender CPU/);
  const jobWait=page.waitForEvent('download');await page.locator('#download-render-job').click();const jobDownload=await jobWait;const portable=JSON.parse(await fs.readFile(await jobDownload.path(),'utf8'));assert.equal(portable.payload.script.renderQuality,'ultra');assert.equal(portable.payload.script.cartoon.enabled,true);
  await page.locator('#cartoon-enabled').uncheck();assert.equal(await page.locator('#cartoon-controls').isVisible(),false);await page.locator('#cartoon-enabled').check();await page.locator('#render-quality').selectOption('high');
  script=JSON.parse(await page.locator('#script-json').inputValue());
  await (await inWorkspace(page.locator('#script-json'))).fill(JSON.stringify(script));await page.locator('#apply-json').click();
  assert.deepEqual(JSON.parse(await page.locator('#script-json').inputValue()).cartoon,script.cartoon);
  if(mode==='hosted'){
   await (await inWorkspace(page.locator('#generate'))).click();await page.waitForFunction(()=>/Ready —|failed|cancelled/.test(document.querySelector('#jobs').textContent),null,{timeout:180000});assert.match(await page.locator('#jobs').innerText(),/Ready —/);
   const wait=page.waitForEvent('download');await page.getByRole('link',{name:/^Download video/}).click();const download=await wait;
   const out=path.join(ROOT,'output/digital-look');await fs.mkdir(out,{recursive:true});const file=path.join(out,'high-cartoon'+path.extname(download.suggestedFilename()));await download.saveAs(file);
   const probe=JSON.parse(await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));const video=probe.streams.find(s=>s.codec_type==='video');assert.equal(video.width,192);assert.equal(video.height,320);assert.ok(probe.streams.some(s=>s.codec_type==='audio'));
   await run('ffmpeg',['-v','error','-i',file,'-f','null','-']);
   console.log(JSON.stringify({file,width:192,height:320,sandbox:true,quality:'high',cartoon:true}));
  }
  assert.deepEqual(errors,[]);await page.close();
 }
});
