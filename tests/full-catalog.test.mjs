import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadCatalog,verifyCatalog,digest,ROOT} from '../src/library.mjs';
import {importBookPages} from '../tools/import-book-pages.mjs';
import {selectScript,resolveScript} from '../src/contracts.mjs';

test('complete interior is ordered, keeps printed numbering separate, and supplies exact book images',async()=>{
 const c=await loadCatalog();
 assert.equal(c.comics.length,144);
 assert.deepEqual(c.comics.map(p=>p.pdfPage),Array.from({length:144},(_,i)=>i+3));
 assert.deepEqual(c.comics.filter(p=>p.kind==='comic').map(p=>p.printedPage),Array.from({length:141},(_,i)=>i+1));
 assert.deepEqual([c.comics[0],c.comics[1],c.comics.at(-1)].map(p=>[p.kind,p.printedPage]),[['title',null],['copyright',null],['blank',null]]);
 assert.equal(c.comics[2].id,'book2-001');assert.equal(c.comics[142].id,'book2-141');
 assert.equal(new Set(c.comics.map(p=>p.id)).size,144);
 await verifyCatalog(c);
 for(const p of c.comics)assert.equal(digest(await fs.readFile(`${ROOT}/${p.path}`)),p.sha256);
});

test('existing reviewed transcripts survive; new pages never acquire invented transcripts',async()=>{
 const c=await loadCatalog();
 const originals={
  'book2-020':['I will be one of the great men of history! My life will define an era!!','Son do you want some cookies?',"I'll have it all figured out by the time I'm 35"],
  'book2-036':['Are you eating dirt & grubs off the ground?',"You know that's dangerous right?","My brain parasite says you're toxic"],
  'book2-095':['Beautiful! I love a job well done','You painted all the walls from white to white?',"No, it used to be egg-shell. Now it's ivory",'You have too much free time on your hands']
 };
 for(const [id,transcript]of Object.entries(originals))assert.deepEqual(c.comics.find(p=>p.id===id).transcript,transcript);
 for(const p of c.comics.filter(p=>!originals[p.id])){assert.deepEqual(p.transcript,[]);assert.equal(p.transcriptStatus,'not-transcribed');}
 assert.equal(c.edition.pdfSha256,'0b9edc67fc3ba74f8ec257d1c2cc86b35c5e7b1fa894f0395b622cc3125bb3a5');
});

test('random selection excludes non-comic interiors but manual selection and legacy catalogs remain eligible',async()=>{
 const catalog=await loadCatalog();
 const fixture={...catalog,comics:catalog.comics.filter(c=>c.kind!=='comic'||c.id==='book2-020')};
 for(let seed=0;seed<24;seed++)assert.deepEqual(selectScript('book-duet',seed,fixture).comics,['book2-020']);
 for(const comic of fixture.comics.filter(c=>c.kind!=='comic'))assert.doesNotThrow(()=>resolveScript({template:'book-duet',title:'Manual interior',comics:[comic.id],lines:[{speaker:'reader',text:'Manual commentary.',comic:comic.id}]},fixture));
 const legacy=structuredClone(fixture);legacy.comics=[legacy.comics[0]];delete legacy.comics[0].kind;
 assert.deepEqual(selectScript('book-duet',1,legacy).comics,['book2-title']);
 assert.throws(()=>selectScript('book-duet',1,{...fixture,comics:fixture.comics.filter(c=>c.kind!=='comic')}),/not enough verified comics/i);
});

test('importer preserves reviewed entries and rejects reordered source bytes before writing destinations',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'full-book-import-'));
 t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const source=path.join(temp,'source'),root=path.join(temp,'engine'),folder='textures/book2_openable_v2';
 await fs.mkdir(path.join(source,folder),{recursive:true});await fs.mkdir(path.join(root,'assets'),{recursive:true});
 const catalog=await loadCatalog(),pdf=Buffer.from('test edition identity');
 catalog.edition.pdfSha256=digest(pdf);
 await fs.writeFile(path.join(source,'source.pdf'),pdf);
 const manifest={source:'source.pdf',source_sha256:digest(pdf),excluded_pdf_pages:[1,2,147],processing:'Exact bytes',pages:[]};
 for(const c of catalog.comics){
  const texture=`page_${String(c.interiorPage).padStart(3,'0')}.jpg`;
  await fs.copyFile(path.join(ROOT,c.path),path.join(source,folder,texture));
  manifest.pages.push({page:c.interiorPage,pdf_page:c.pdfPage,texture,texture_sha256:c.sha256});
 }
 // Starting with the original three records exercises annotation preservation.
 const original=catalog.comics.filter(c=>['book2-020','book2-036','book2-095'].includes(c.id));catalog.comics=original;
 await fs.writeFile(path.join(root,'assets/catalog.json'),JSON.stringify(catalog));
 await fs.copyFile(path.join(ROOT,'assets/book.glb'),path.join(root,'assets/book.glb'));
 const writeManifest=()=>fs.writeFile(path.join(source,folder,'pages.json'),JSON.stringify(manifest));
 await writeManifest();
 const imported=await importBookPages(source,{root});assert.equal(imported.comics.length,144);
 for(const c of original)assert.deepEqual(imported.comics.find(p=>p.id===c.id),c);
 const before=await fs.readFile(path.join(root,'assets/catalog.json'));
 await importBookPages(source,{root});assert.deepEqual(await fs.readFile(path.join(root,'assets/catalog.json')),before);
 // Valid hashes alone must not bless a page moved to another PDF position.
 const first=await fs.readFile(path.join(source,folder,'page_001.jpg'));
 await fs.copyFile(path.join(source,folder,'page_002.jpg'),path.join(source,folder,'page_001.jpg'));
 await fs.writeFile(path.join(source,folder,'page_002.jpg'),first);
 [manifest.pages[0].texture_sha256,manifest.pages[1].texture_sha256]=[manifest.pages[1].texture_sha256,manifest.pages[0].texture_sha256];
 await writeManifest();
 // Remove the two new entries from the target metadata to test a fresh import's mapping check.
 const originalOnly={...imported,comics:original};await fs.writeFile(path.join(root,'assets/catalog.json'),JSON.stringify(originalOnly));
 await fs.unlink(path.join(root,'assets/comics/book2-title.jpg'));await fs.unlink(path.join(root,'assets/comics/book2-copyright.jpg'));
 const unchanged=await fs.readFile(path.join(root,'assets/catalog.json'));
 await assert.rejects(importBookPages(source,{root}),/embedded|book page/i);
 assert.deepEqual(await fs.readFile(path.join(root,'assets/catalog.json')),unchanged);
 await assert.rejects(fs.access(path.join(root,'assets/comics/book2-title.jpg')));
});
