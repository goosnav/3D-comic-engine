// Web Crypto is available in both supported Node and secure browser contexts.
const randomInt=()=>globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
import {bookSpread} from './book-pages.mjs';
import {emotions} from './facial-performance.mjs';
import {gestures,ARM_GESTURES} from './gesture-performance.mjs';
import {captionDefaults} from './caption-defaults.mjs';
import {normalizePresentation,scriptWarnings} from './script-normalization.mjs';
export const EMOTIONS=Object.keys(emotions);
export const GESTURES=['none','explain','nod','head_tilt','shrug','page_glance',...Object.keys(gestures)];
export const SHOTS=['auto','speaker','two-shot','over-shoulder','book','source','close-up','medium','wide','extreme-wide'];
export const BOOK_ACTIONS=['open','turn','hold','read','place','close','slam','throw'];
export const PARTNER_ACTIONS=['punch','nose_touch','high_five','handshake','ascend'];
// Solo gmod-style stunts are appended; existing ids and order stay stable.
export const GMOD_ACTIONS=['t_pose','ragdoll','noclip','big_head','jitter','helicopter','goose_chase'];
export const ACTOR_ACTIONS=['punch','explode','flatten','nose_off','head_spin','head_jerk','walk_away','nose_touch','high_five','handshake','dance','ascend',...GMOD_ACTIONS];
export const MAX_EXTRAS=4;
// Colour grade of the 3D stage (src/grade.mjs). Omitted means muted.
export const GRADES=['muted','film','vivid'];
// Ordered dither over the whole picture and captions. Omitted means subtle.
export const DITHERS=['subtle','crunchy','off'];
export const ACTIONS=[...BOOK_ACTIONS,...ACTOR_ACTIONS];
export const GAZES=['auto','partner','away','book','ceiling','camera'];
export const OUTPUT_PRESETS=Object.freeze({
 instagram_reels:{label:'Instagram Reels / Stories · 9:16 · 1080 × 1920',width:1080,height:1920},
 instagram_portrait:{label:'Instagram portrait · 4:5 · 1080 × 1350',width:1080,height:1350},
 landscape:{label:'Landscape · 16:9 · 1920 × 1080',width:1920,height:1080},
 square:{label:'Square · 1:1 · 1080 × 1080',width:1080,height:1080},
});
export function resolveOutput(raw={}){
 keys(raw,['preset','width','height','fps'],'output');
 const preset=raw.preset===undefined?null:OUTPUT_PRESETS[choice(raw.preset,Object.keys(OUTPUT_PRESETS),'output.preset')];
 const output={width:preset?.width??1080,height:preset?.height??1920,fps:24,...raw};
 for(const k of ['width','height']){number(output[k],128,1920,'output.'+k);if(output[k]%2)fail(`output.${k} must be an even integer`);if(preset&&output[k]!==preset[k])fail(`output.${k} conflicts with output.preset; omit preset for custom dimensions`);}
 choice(output.fps,[12,24,30],'output.fps');return output;
}
export function previewOutput(raw){
 const {width,height}=resolveOutput(raw);
 const scale=Math.max(128/Math.min(width,height),Math.min(1,432/Math.min(width,height),768/Math.max(width,height)));
 return {width:Math.round(width*scale/2)*2,height:Math.round(height*scale/2)*2,fps:12};
}
function gaze(v,label,speakers){if(v===undefined)return;keys(v,speakers,label);for(const [id,target] of Object.entries(v))choice(target,GAZES,label+'.'+id);}

const fail=(s)=>{throw new Error(s);};
const object=(v,label)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(`${label} must be an object`);};
const keys=(v,allowed,label)=>{object(v,label);for(const k of Object.keys(v))if(!allowed.includes(k))fail(`${label}.${k}: unknown field. Options: ${allowed.join(', ')}`);};
const number=(v,lo,hi,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)fail(`${label} must be ${lo}–${hi}`);return v;};
const choice=(v,options,label)=>{if(!options.includes(v))fail(`${label}: choose ${options.join(', ')}`);return v;};
export function seeded(seed){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
// Background cameos. Undeclared catalogs (old installs, test fixtures) have none.
// A goose chase brings its own goose so the action can never render without one.
function resolveExtras(raw,lines,catalog){
 const ids=catalog.extras?.map(e=>e.id)??[];
 if(raw!==undefined&&(!Array.isArray(raw)||raw.length>MAX_EXTRAS||new Set(raw).size!==raw.length))fail(`extras must be a list of up to ${MAX_EXTRAS} different cameo IDs`);
 const extras=(raw??[]).map((id,i)=>choice(id,ids,`extras[${i}]`));
 if(lines.some(line=>line.action==='goose_chase')&&!extras.includes('goose')){
  if(!ids.includes('goose'))fail('goose_chase needs a catalog with the goose cameo');
  if(extras.length>=MAX_EXTRAS)fail(`goose_chase adds the goose; list at most ${MAX_EXTRAS-1} other extras`);
  extras.push('goose');
 }
 return extras;
}
function face(v,label){if(v===undefined)return {};keys(v,['brow_left','brow_right','eye_open','mouth_curve','blink'],label);for(const [k,n]of Object.entries(v)){if(k==='blink')choice(n,['auto','once','off'],label+'.blink');else number(n,k==='eye_open'?0:-1,1,label+'.'+k);}return {...v};}
function selection(template,ids,catalog){
 const t=catalog.templates.find(t=>t.id===template);if(!t)fail(`template: choose ${catalog.templates.map(t=>t.id).join(', ')}`);
 if(!Array.isArray(ids)||ids.length<t.minComics||ids.length>t.maxComics||new Set(ids).size!==ids.length)fail(`${template} needs ${t.minComics}–${t.maxComics} distinct comic IDs`);
 const selected=ids.map(id=>{const c=catalog.comics.find(c=>c.id===id&&c.verified);if(!c)fail(`Unknown or unverified comic: ${id}`);return c;});return {t,selected};
}
function selectScene(requested,template,characters,catalog,seed){
 const restrictions=template.speakers.flatMap(actor=>{
  const variant=catalog.variants?.find(v=>v.id===characters[actor]);
  if(variant?.allowedScenes===undefined)return [];
  if(!Array.isArray(variant.allowedScenes)||!variant.allowedScenes.every(s=>typeof s==='string'))fail(`characters.${actor}: ${variant.id} has invalid allowedScenes metadata`);
  return [{actor,variant:variant.id,allowed:variant.allowedScenes}];
 });
 const compatible=template.scenes.filter(scene=>restrictions.every(r=>r.allowed.includes(scene)));
 if(requested!==undefined&&requested!==null){
  choice(requested,template.scenes,'scene');
  const conflict=restrictions.find(r=>!r.allowed.includes(requested));
  if(conflict)fail(`scene ${requested} is incompatible with characters.${conflict.actor} (${conflict.variant}); compatible scenes for this cast/template: ${compatible.join(', ')||'none'}`);
  return requested;
 }
 if(!compatible.length)fail(`No compatible scene for template ${template.id} and cast ${restrictions.map(r=>`${r.actor} (${r.variant})`).join(', ')}`);
 // Preserve template order and the original single seeded draw. Optional scene
 // additions cannot perturb old scripts; restricted casts can opt into scenes
 // only when none of the default scenes can accommodate them.
 const defaults=compatible.filter(scene=>catalog.scenes?.find(s=>s.id===scene)?.default!==false);
 const pool=defaults.length?defaults:restrictions.length?compatible:[];
 if(!pool.length)fail(`No default scene for template ${template.id}; choose an explicit scene: ${compatible.join(', ')}`);
 return pool[Math.floor(seeded(seed)()*pool.length)];
}
// Also used before editor shape checks; incomplete drafts may still be edited.
export function repairScript(raw,options){
 return normalizePresentation(raw,{emotions:EMOTIONS,gestures:GESTURES,shots:SHOTS,gazes:GAZES,grades:GRADES,dithers:DITHERS,armGestures:ARM_GESTURES,actorActions:ACTOR_ACTIONS},options);
}
export function resolveScript(raw,catalog,options){
 raw=repairScript(raw,options);
 keys(raw,['version','template','title','comics','seed','scene','lines','output','sourceLock','cast','characters','product','endCard','captions','extras','grade','dither','warnings'], 'script');
 if((raw.version??1)!==1)fail('version must be 1');
 if(typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>160)fail('title must contain 1–160 characters');
 const {t,selected}=selection(raw.template,raw.comics,catalog);
 const captions=captionDefaults(raw.captions);
 if(raw.captions!==undefined)keys(raw.captions,['enabled','position','colors'],'captions');
 if(typeof captions.enabled!=='boolean')fail('captions.enabled must be true or false');
 choice(captions.position,['top','bottom'],'captions.position');
 if(raw.captions?.colors!==undefined)keys(raw.captions.colors,['reader','friend'],'captions.colors');
 for(const [id,color] of Object.entries(captions.colors))if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))fail(`captions.colors.${id} must be a six-digit hex color`);
 const product=choice(raw.product??'book2',['book2'],'product');
 const variants=catalog.variants?.map(v=>v.id)??['blue','rust','olive'];
 const characters={};if(raw.characters!==undefined)keys(raw.characters,[...new Set(catalog.templates.flatMap(t=>t.speakers))],'characters');
 for(const [id,variant] of Object.entries(raw.characters??{}))characters[id]=choice(variant,variants,`characters.${id}`);
 for(const [i,id] of t.speakers.entries())characters[id]=choice(raw.characters?.[id]??variants[i%variants.length],variants,`characters.${id}`);
 const endCard={enabled:true,title:'Goosnav Book Two',text:'A book of comics.',url:'www.goosnav.shop',seconds:3,...raw.endCard};
 if(raw.endCard!==undefined)keys(raw.endCard,['enabled','title','text','url','seconds'],'endCard');
 if(typeof endCard.enabled!=='boolean')fail('endCard.enabled must be true or false');
 for(const [key,max] of [['title',120],['text',240],['url',160]])if(typeof endCard[key]!=='string'||endCard[key].length>max||/[\u0000-\u0008\u000b-\u001f]/.test(endCard[key]))fail(`endCard.${key} must be plain text up to ${max} characters`);
 number(endCard.seconds,1,12,'endCard.seconds');
 const seed=raw.seed??randomInt(0,2147483647);number(seed,0,4294967295,'seed');if(!Number.isInteger(seed))fail('seed must be an integer');
 const scene=selectScene(raw.scene,t,characters,catalog,seed);
 const sourceLock=selected.map(c=>({id:c.id,sha256:c.sha256,pdfPage:c.pdfPage,pdfSha256:catalog.edition.pdfSha256}));
 if(raw.sourceLock!==undefined&&(!Array.isArray(raw.sourceLock)||raw.sourceLock.length!==sourceLock.length||raw.sourceLock.some((lock,i)=>!lock||typeof lock!=='object'||Array.isArray(lock)||Object.keys(lock).length!==Object.keys(sourceLock[i]).length||Object.entries(sourceLock[i]).some(([key,value])=>lock[key]!==value))))fail('Source lock changed. Re-select and review the source before creating a new script.');
 if(!Array.isArray(raw.lines)||!raw.lines.length||raw.lines.length>200)fail('lines must contain 1–200 entries');
 let state=raw.lines[0]?.action==='open'?'table-closed':'table-open',current=selected[0].id;
 const used=new Set();
 const lines=raw.lines.map((line,i)=>{
  const label=`lines[${i}]`;object(line,label);
  if(line.action!==undefined){
   keys(line,['action','comic','seconds','id','bookState','actor','target','gaze','shot'],label);choice(line.action,ACTIONS,label+'.action');
   gaze(line.gaze,label+'.gaze',t.speakers);
   if(line.shot!==undefined)choice(line.shot,SHOTS,label+'.shot');
   if(ACTOR_ACTIONS.includes(line.action)){
    if(state==='held-open')fail(`${label}: place the book before a character action`);
    const actor=choice(line.actor??t.speakers[0],t.speakers,label+'.actor');
    const target=PARTNER_ACTIONS.includes(line.action)?choice(line.target??t.speakers.find(id=>id!==actor),t.speakers,label+'.target'):undefined;
    if(target===actor)fail(`${label}: ${line.action} needs a different target actor`);
    if(!PARTNER_ACTIONS.includes(line.action)&&line.target!==undefined)fail(`${label}: ${line.action} has no target`);
    if(line.comic!==undefined&&line.comic!==current)fail(`${label}: character actions cannot change the comic`);
    return {...line,actor,...(target?{target}:{}),id:`beat-${i}`,seconds:number(line.seconds??2.4,.8,8,label+'.seconds'),comic:current,bookState:state};
   }
   if(line.actor!==undefined||line.target!==undefined)fail(`${label}: book actions use the reader; actor/target are for character actions`);
   if(line.action==='turn'&&!line.comic)fail(`${label}: turn needs an explicit target comic`);
   if(line.comic&&line.comic!==current&&!['open','turn'].includes(line.action))fail(`${label}: only open/turn actions may change the comic; use dialogue comic for a source cut`);
   const transitions={open:['table-closed','table-open'],turn:['table-open','table-open'],hold:['table-open','held-open'],read:[state,state],place:['held-open','table-open'],close:['table-open','table-closed'],slam:['table-open','table-closed'],throw:['held-open','table-closed']};
   const [from,to]=transitions[line.action];if(state!==from||line.action==='read'&&state==='table-closed')fail(`${label}: ${line.action} needs ${from==='table-closed'?'closed':from} book state, currently ${state}`);
   if(line.comic){if(!raw.comics.includes(line.comic))fail(`${label}: comic is not selected`);if(line.action==='turn'){const a=catalog.comics.find(c=>c.id===current),b=catalog.comics.find(c=>c.id===line.comic);if(bookSpread(a.pdfPage)===null||bookSpread(b.pdfPage)===null||Math.abs(bookSpread(a.pdfPage)-bookSpread(b.pdfPage))!==1)fail(`${label}: turn requires an adjacent spread; use a line's comic field for a deliberate source cut`);}current=line.comic;}
   state=to;return {...line,id:`beat-${i}`,seconds:number(line.seconds??({throw:1.8,slam:.65,turn:1.2,open:1.3,hold:1,place:1,close:.9,read:1}[line.action]),.3,8,label+'.seconds'),comic:current,bookState:state};
  }
  keys(line,['speaker','text','comic','emotion','gesture','face','reaction','pause','shot','audio','id','bookState','gaze'],label);
  gaze(line.gaze,label+'.gaze',t.speakers);
  choice(line.speaker,t.speakers,label+'.speaker');if(typeof line.text!=='string'||!line.text.trim()||line.text.length>1000)fail(`${label}.text needs 1–1000 characters`);
  const comic=line.comic??current;if(!raw.comics.includes(comic))fail(`${label}: comic ${comic} is not selected/declared`);
  if(state==='table-closed')fail(`${label}: open the book before reading dialogue`);
  if(comic!==current&&state==='held-open')fail(`${label}: place the held book before switching comic`);
  current=comic;used.add(comic);const gesture=choice(line.gesture??'none',GESTURES,label+'.gesture');
  if(state==='held-open'&&line.speaker==='reader'&&ARM_GESTURES.includes(gesture))fail(`${label}: held book reserves the reader's hands; choose a head gesture or none`);
  let reaction;if(line.reaction){keys(line.reaction,['actor','emotion','gesture','face','at','duration','gaze'],label+'.reaction');reaction={...line.reaction,actor:line.reaction.actor??t.speakers.find(s=>s!==line.speaker),emotion:choice(line.reaction.emotion??'neutral',EMOTIONS,label+'.reaction.emotion'),gesture:choice(line.reaction.gesture??'none',GESTURES,label+'.reaction.gesture'),face:face(line.reaction.face,label+'.reaction.face'),at:choice(line.reaction.at??'line_start',['line_start','line_end'],label+'.reaction.at'),duration:number(line.reaction.duration??.8,.1,5,label+'.reaction.duration')};if(reaction.gaze!==undefined)choice(reaction.gaze,GAZES,label+'.reaction.gaze');if(!t.speakers.includes(reaction.actor)||reaction.actor===line.speaker)fail(`${label}: reaction needs a different cast actor`);}
  if(line.audio!==undefined&&(typeof line.audio!=='string'||!line.audio||line.audio.includes('\0')))fail(`${label}.audio must be a relative filename`);
  if(state==='held-open'&&reaction?.actor==='reader'&&ARM_GESTURES.includes(reaction.gesture))fail(`${label}: held book reserves the reader's hands during reactions too`);
  return {...line,id:`beat-${i}`,comic,emotion:choice(line.emotion??'neutral',EMOTIONS,label+'.emotion'),gesture,face:face(line.face,label+'.face'),pause:number(line.pause??0,0,5,label+'.pause'),shot:choice(line.shot??'auto',SHOTS,label+'.shot'),...(reaction?{reaction}:{}),bookState:state};
 });
 if(!used.size)fail('At least one dialogue line is required');for(const c of raw.comics)if(!used.has(c))fail(`Selected comic ${c} needs a dialogue line`);
 const output=resolveOutput(raw.output);
 const extras=resolveExtras(raw.extras,lines,catalog);
 if(raw.grade!==undefined)choice(raw.grade,GRADES,'grade');
 if(raw.dither!==undefined)choice(raw.dither,DITHERS,'dither');
 const warnings=scriptWarnings(raw);
 return {...(warnings.length?{warnings}:{}),version:1,template:t.id,title:raw.title.trim(),comics:[...raw.comics],seed,scene,lines,output,sourceLock,characters,product,endCard,captions,...(extras.length?{extras}:{}),...(raw.grade!==undefined?{grade:raw.grade}:{}),...(raw.dither!==undefined?{dither:raw.dither}:{}),cast:t.speakers.map(id=>({id,voice:id==='reader'?'am_onyx':'am_puck'}))};
}
export function selectScript(template,seed=randomInt(0,2147483647),catalog){
 const t=catalog.templates.find(t=>t.id===template);if(!t)fail('Unknown template');number(seed,0,4294967295,'seed');const rand=seeded(seed);
 const pool=catalog.comics.filter(c=>c.verified&&(!c.kind||c.kind==='comic'));for(let i=pool.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 if(pool.length<t.minComics)fail('Not enough verified comics for this template');
 const comics=pool.slice(0,t.minComics).map(c=>c.id);
 return resolveScript({template,title:'New comic conversation',comics,seed,lines:comics.map(comic=>({speaker:'reader',comic,text:'Write your commentary here.'}))},catalog);
}
