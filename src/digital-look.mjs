// Stage-only screen-space cartoon treatment, shared with the WebGL pass.
// Captions, source inserts and endcards are composited afterward.
export function cartoonSettings(options={},width=1080,height=1920){
 const {enabled=false,pixelSize=4,outline=1,shades=5}=options;
 if(typeof enabled!=='boolean'||!Number.isInteger(pixelSize)||pixelSize<1||pixelSize>12||!Number.isFinite(outline)||outline<0||outline>2||!Number.isInteger(shades)||shades<2||shades>12)throw Error('Invalid digital cartoon settings');
 return {enabled,pixelSize,outline,shades,pixels:Math.max(1,Math.round(pixelSize*Math.min(width,height)/1080))};
}
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export function applyDigitalCartoon(ctx,options){
 const {width,height}=ctx.canvas,settings=cartoonSettings(options,width,height);if(!settings.enabled)return;
 const {pixels,outline,shades}=settings,source=ctx.getImageData(0,0,width,height),out=ctx.createImageData(width,height);
 const w=Math.ceil(width/pixels),h=Math.ceil(height/pixels),grid=new Float32Array(w*h*3);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*3,x0=x*pixels,y0=y*pixels,nx=Math.min(width,x0+pixels),ny=Math.min(height,y0+pixels);let n=0;
  for(let yy=y0;yy<ny;yy++)for(let xx=x0;xx<nx;xx++){const i=(yy*width+xx)*4;for(let c=0;c<3;c++)grid[p+c]+=source.data[i+c]/255;n++;}
  for(let c=0;c<3;c++)grid[p+c]/=n;
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*3;let difference=0;
  for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){const q=(Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx)))*3;for(let c=0;c<3;c++)difference=Math.max(difference,Math.abs(grid[p+c]-grid[q+c]));}
  const edge=Math.min(1,smooth(.055,.18,difference)*outline),color=[];
  const luma=grid[p]*.2126+grid[p+1]*.7152+grid[p+2]*.0722;
  const tone=Math.max(.04,Math.round(luma*(shades-1))/(shades-1)),gain=tone/Math.max(.001,luma);
  for(let c=0;c<3;c++)color[c]=Math.round(255*(Math.round(Math.min(1,grid[p+c]*gain)*63)/63*(1-edge)+.025*edge));
  for(let yy=y*pixels;yy<Math.min(height,(y+1)*pixels);yy++)for(let xx=x*pixels;xx<Math.min(width,(x+1)*pixels);xx++){
   const i=(yy*width+xx)*4;for(let c=0;c<3;c++)out.data[i+c]=color[c];out.data[i+3]=source.data[i+3];
  }
 }
 ctx.putImageData(out,0,0);
}
export const DIGITAL_GLSL=`
uniform float cartoonEnabled, cartoonPixels, cartoonOutline, cartoonShades;
vec3 cartoonSample(vec2 uv){
 vec3 c=texture2D(tScene,clamp(uv,vec2(0.0),vec2(1.0))).rgb;
 #ifdef TONE_MAPPING
 c=toneMapping(c);
 #endif
 return clamp(linearToOutputTexel(vec4(c,1.0)).rgb,0.0,1.0);
}
vec3 digitalCartoon(vec3 color,vec2 uv){
 vec2 stepSize=cartoonPixels/resolution;vec3 center=cartoonSample(uv);
 vec3 d=max(abs(center-cartoonSample(uv+vec2(stepSize.x,0.0))),abs(center-cartoonSample(uv-vec2(stepSize.x,0.0))));
 d=max(d,abs(center-cartoonSample(uv+vec2(0.0,stepSize.y))));d=max(d,abs(center-cartoonSample(uv-vec2(0.0,stepSize.y))));
 float edge=min(1.0,smoothstep(.055,.18,max(d.r,max(d.g,d.b)))*cartoonOutline);
 float luma=dot(color,vec3(.2126,.7152,.0722));
 float tone=max(.04,floor(luma*(cartoonShades-1.0)+.5)/(cartoonShades-1.0));
 vec3 flatColor=floor(clamp(color*tone/max(.001,luma),0.0,1.0)*63.0+.5)/63.0;
 return mix(flatColor,vec3(.025),edge);
}`;
