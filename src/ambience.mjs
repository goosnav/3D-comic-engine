// Original procedural ambience shared by browser and offline export. No assets,
// wall clock, platform audio nodes, or random global state enter the synthesis.
const MAX_SAMPLES = 600 * 48000;
const smooth = value => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };

/** Mono PCM at sampleRate; null means leave the existing audio mix untouched.
 * Maximum allocation is 110 MiB (600 seconds at 48 kHz). Call before starting
 * the recording clock. Pre-aborted signals reject before allocating anything.
 */
export function renderAmbience(timeline, {sampleRate=48000, music=false, signal}={}) {
 signal?.throwIfAborted();
 const duration=timeline.duration, mode=timeline.ambience?.mode??'auto', volume=timeline.ambience?.volume??.35;
 if(!Number.isFinite(duration)||duration<0||duration>600)throw new RangeError('Ambience duration must be between 0 and 600 seconds');
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000||Math.ceil(duration*sampleRate)>MAX_SAMPLES)throw new RangeError('Ambience sample rate or sample count exceeds its resource bound');
 if(!['auto','off','room','laundromat'].includes(mode)||!Number.isFinite(volume)||volume<0||volume>1)throw new RangeError('Invalid ambience mode or volume');
 if(mode==='off'||volume===0||(mode==='auto'&&music)||duration===0)return null;
 const samples=new Float32Array(Math.ceil(duration*sampleRate)), laundry=mode==='laundromat';
 const intervals=[];
 for(const event of (timeline.events??[]).filter(e=>e.type==='line').sort((a,b)=>a.start-b.start)) {
  if(!Number.isFinite(event.start)||!Number.isFinite(event.end)||event.end<=event.start)continue;
  const previous=intervals.at(-1);
  if(previous&&event.start<=previous.end)previous.end=Math.max(previous.end,event.end);
  else intervals.push({start:event.start,end:event.end});
 }
 let random=((timeline.seed??0)^0x6d2b79f5)>>>0, low=0, slow=0, index=0;
 const noiseRate=1-Math.exp(-2*Math.PI*500/sampleRate), slowRate=1-Math.exp(-2*Math.PI*35/sampleRate);
 const end=(samples.length-1)/sampleRate;
 for(let i=0;i<samples.length;i++) {
  if((i&4095)===0)signal?.throwIfAborted();
  const t=i/sampleRate;
  random=(Math.imul(random,1664525)+1013904223)>>>0;
  const white=random/2147483648-1;
  low+=(white-low)*noiseRate;slow+=(white-slow)*slowRate;
  while(index<intervals.length&&t>intervals[index].end)index++;
  const next=intervals[index], previous=intervals[index-1];
  let envelope=1;
  if(next)envelope=1-.78*smooth((t-next.start+.15)/.15);
  if(previous)envelope=Math.min(envelope,.22+.78*smooth((t-previous.end)/.45));
  // Room: electrical hum and filtered ventilation. Laundry adds a slow drum,
  // uneven motor harmonics, and soft moving air; none are recorded assets.
  let value=.022*Math.sin(2*Math.PI*60*t)+.008*Math.sin(2*Math.PI*120*t+.4)+.012*low;
  if(laundry)value+=.014*Math.sin(2*Math.PI*43*t)*( .7+.3*Math.sin(2*Math.PI*.73*t))+.008*slow+.006*low*(1+Math.sin(2*Math.PI*2.7*t));
  const fade=smooth(t/.75)*smooth((end-t)/.75);
  samples[i]=value*volume*envelope*fade;
 }
 return samples;
}

/** Reduce only the new ambience contribution near speech peaks. Existing music
 * uses a reserved peak budget; this never changes or amplifies speech samples.
 */
export function limitAmbience(ambience, speech, reserve=0) {
 const ceiling=1-reserve;
 return Math.max(-Math.max(0,ceiling+speech),Math.min(Math.max(0,ceiling-speech),ambience));
}
