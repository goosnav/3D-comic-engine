import test from 'node:test';
import assert from 'node:assert/strict';
import {browserFixture} from './speech-export-fixture.mjs';

test('caption pixels stay in the chosen quarter, change with the speaker, and vanish outside speech',async t=>{
 const {page}=await browserFixture(t,['src/captions.mjs']);
 const results=await page.evaluate(async()=>{
  const {createCaptions}=await import('/src/captions.mjs'),results=[];
  for(const [width,height] of [[432,768],[432,540],[768,432],[432,432]])for(const position of ['top','bottom']){
   const layer=createCaptions(width,height,{enabled:true,position,colors:{reader:'#ff0000',friend:'#00ff00'}});
   const canvas=layer.scene.children[0].material.map.image,ctx=canvas.getContext('2d');
   const event={type:'line',speaker:'reader',start:1,captions:[{text:'Five words that remain readable',start:0,end:1},{text:'Next phrase.',start:1,end:2}]};
   layer.draw(event,1.5);const pixels=ctx.getImageData(0,0,width,height).data;let min=height,max=-1,red=0;
   for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]){const y=Math.floor(i/4/width);min=Math.min(min,y);max=Math.max(max,y);if(pixels[i]>200&&pixels[i+1]<10)red++;}
   layer.draw({...event,speaker:'friend'},2.5);const green=layer.diagnostics();
   layer.draw(event,3);const empty=ctx.getImageData(0,0,width,height).data.every(v=>v===0);
   results.push({width,height,position,min,max,red,green,empty});
  }
  const off=createCaptions(128,128,{enabled:false,position:'top',colors:{reader:'#ffffff'}});
  off.draw({type:'line',start:0,speaker:'reader',captions:[{text:'No text',start:0,end:1}]},.5);
  return {results,disabled:off.diagnostics()};
 });
 assert.equal(results.disabled,null);
 for(const r of results.results){assert.ok(r.red>50);assert.equal(r.green.color,'#00ff00');assert.equal(r.green.text,'Next phrase.');assert.ok(r.empty);assert.ok(r.min>=r.height*(r.position==='top'?0:.75));assert.ok(r.max<r.height*(r.position==='top'?.25:1));}
});
