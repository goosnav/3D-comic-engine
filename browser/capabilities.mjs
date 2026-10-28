import {supportedRecordingTypes} from './recording.mjs';
let cached;
export function invalidateBrowserCapabilities(){cached=undefined;}
export function browserCapabilities(){
 if(cached)return cached;
 const canvas=document.createElement('canvas');let gl;
 try{gl=canvas.getContext('webgl2');}catch{}
 const webgl=!!gl&&!gl.isContextLost();gl?.getExtension('WEBGL_lose_context')?.loseContext();
 return cached={renderer:webgl?'webgl':null,webgl,canvasCapture:typeof canvas.captureStream==='function',audio:!!(globalThis.AudioContext??globalThis.webkitAudioContext),formats:supportedRecordingTypes(),fallback:'portable render-job download → local CLI with Blender CPU'};
}
