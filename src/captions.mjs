import * as THREE from 'three';
import { ditherCanvas } from './grade.mjs';
import { captionDefaults, captionCenter } from './caption-defaults.mjs';

export function createCaptions(width, height, config, dither = 'off') {
  config = captionDefaults(config);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1,1,1,-1,0,2);
  camera.position.z = 1;
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})));
  let state = null, key = '';
  function draw(event, time) {
    const cue = config?.enabled && event?.type === 'line' ? event.captions?.find(c => time-event.start >= c.start && time-event.start < c.end) : null;
    state = cue ? {text:cue.text,speaker:event.speaker,color:config.colors[event.speaker],position:config.position} : null;
    const next = JSON.stringify(state);
    if (next === key) return;
    key = next; ctx.clearRect(0,0,width,height);
    if (state) {
      let size = Math.min(width * .078, height * .075), lines;
      const wrap = () => {
        // Bundled font first. Some Linux setups map Helvetica to a font Chromium
        // measures but never draws, which left captions invisible.
        ctx.font = `700 ${size}px ComicTheatreSans, Arial, "Liberation Sans", sans-serif`;
        const rows = [''];
        for (const word of state.text.split(/\s+/)) {
          const row = rows.at(-1), candidate = row ? `${row} ${word}` : word;
          if (row && ctx.measureText(candidate).width > width*.88) rows.push(word); else rows[rows.length-1]=candidate;
        }
        return rows;
      };
      do { lines=wrap(); if(lines.length<=2 && lines.every(l=>ctx.measureText(l).width<=width*.88))break; size*=.9; } while(size>.05);
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
      ctx.fillStyle=state.color;ctx.strokeStyle='#101010';ctx.lineWidth=Math.max(2,size*.09);
      const center = captionCenter(height, config.position);
      // With dither on, the fill shades lighter to darker down each line so the
      // dither pattern shows inside the letters, like a palette-limited sprite.
      const shade=(hex,k)=>'#'+[1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16);return Math.round(k>0?v+(255-v)*k:v*(1+k)).toString(16).padStart(2,'0');}).join('');
      lines.forEach((line,i)=>{
        const y=center+(i-(lines.length-1)/2)*size*1.15;
        if(dither!=='off'){const g=ctx.createLinearGradient(0,y-size*.42,0,y+size*.42);g.addColorStop(0,shade(state.color,.28));g.addColorStop(1,shade(state.color,-.22));ctx.fillStyle=g;}
        ctx.strokeText(line,width/2,y,width*.88);ctx.fillText(line,width/2,y,width*.88);
      });
      // Same ordered dither as the picture: crunchy text edges and fills.
      const band=(lines.length+1)*size*1.15/2;
      ditherCanvas(ctx,width,height,dither,center-band,center+band);
    }
    texture.needsUpdate=true;
  }
  return {scene,camera,draw,diagnostics:()=>state};
}
