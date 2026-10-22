import {run} from '../src/process.mjs';
export async function openBrowser(url){
 const parsed=new URL(url);
 if(parsed.protocol!=='http:'||parsed.hostname!=='127.0.0.1')throw Error('GUI browser URL must be local');
 if(process.platform==='win32')return run('rundll32.exe',['url.dll,FileProtocolHandler',parsed.href],{timeout:15000});
 return run(process.platform==='darwin'?'open':'xdg-open',[parsed.href],{timeout:15000});
}
