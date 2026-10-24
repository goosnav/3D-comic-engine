import * as THREE from 'three';

export function createCaptions(width, height, config) {
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
        ctx.font = `700 ${size}px Helvetica, Arial, ComicTheatreSans, sans-serif`;
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
      const center = height * (config.position==='top' ? .125 : .875);
      lines.forEach((line,i)=>{const y=center+(i-(lines.length-1)/2)*size*1.15;ctx.strokeText(line,width/2,y,width*.88);ctx.fillText(line,width/2,y,width*.88);});
    }
    texture.needsUpdate=true;
  }
  return {scene,camera,draw,diagnostics:()=>state};
}
