import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,digest,loadCatalog,safePath,verifyBookPages} from '../src/library.mjs';

/** Import exact interior JPEGs only; never OCR or invent source dialogue. */
export async function importBookPages(sourceRoot,{root=ROOT}={}){
 const folder='textures/book2_openable_v2',manifestPath=await safePath(sourceRoot,folder+'/pages.json');
 const manifestBytes=await fs.readFile(manifestPath),manifest=JSON.parse(manifestBytes);
 const catalog=await loadCatalog(root);
 if(manifest.source_sha256!==catalog.edition.pdfSha256||digest(await fs.readFile(await safePath(sourceRoot,manifest.source)))!==manifest.source_sha256)throw Error('Source PDF hash does not match the catalog edition');
 if(JSON.stringify(manifest.excluded_pdf_pages)!=='[1,2,147]'||manifest.pages?.length!==144)throw Error('Expected the complete 144-page interior, excluding covers and spine');
 const imports=[],comics=[];
 for(const [i,p]of manifest.pages.entries()){
  if(p.page!==i+1||p.pdf_page!==i+3||p.texture!==`page_${String(i+1).padStart(3,'0')}.jpg`)throw Error('Interior order or texture mapping changed');
  const bytes=await fs.readFile(await safePath(sourceRoot,folder+'/'+p.texture));
  if(digest(bytes)!==p.texture_sha256)throw Error(`Source hash mismatch: ${p.texture}`);
  const printedPage=i>=2&&i<=142?i-1:null;
  const kind=i===0?'title':i===1?'copyright':i===143?'blank':'comic';
  const id=printedPage===null?`book2-${kind}`:`book2-${String(printedPage).padStart(3,'0')}`;
  const existing=catalog.comics.find(c=>c.id===id);
  if(existing&&(existing.sha256!==p.texture_sha256||existing.pdfPage!==p.pdf_page))throw Error(`Existing source identity changed: ${id}`);
  const entry={id,title:printedPage===null?({title:'Title page',copyright:'Copyright page',blank:'Final blank page'}[kind]):`Book Two · page ${printedPage}`,path:`assets/comics/${id}.jpg`,sha256:p.texture_sha256,pdfPage:p.pdf_page,printedPage,verified:true,transcript:[],transcriptStatus:'not-transcribed',...existing,kind,interiorPage:p.page,sourceTexture:`${folder}/${p.texture}`};
  // Preserve existing annotations, but do not imply their inspection covered new pages.
  if(existing?.transcript?.length)entry.transcriptStatus='reviewed';
  const destination=path.join(root,entry.path);
  try{if(digest(await fs.readFile(destination))!==entry.sha256)throw Error(`Refusing to overwrite changed image: ${entry.path}`);}catch(e){if(e.code!=='ENOENT')throw e;}
  comics.push(entry);imports.push({destination,bytes});
 }
 catalog.edition.pageInventory={manifest:`${folder}/pages.json`,manifestSha256:digest(manifestBytes),source:manifest.source,sourceSha256:manifest.source_sha256,excludedPdfPages:manifest.excluded_pdf_pages,processing:manifest.processing,verification:'Exact source-file and page identity. Existing evidence of personal inspection applies only to book2-020, book2-036 and book2-095; newly imported pages have no transcript or inferred title.'};
 catalog.comics=comics;
 const book=await fs.readFile(await safePath(root,catalog.assets.book.path));
 if(digest(book)!==catalog.assets.book.sha256)throw Error('Book GLB hash mismatch');
 verifyBookPages(book,comics);
 // All source and existing-destination checks complete before the first write.
 await fs.mkdir(path.join(root,'assets/comics'),{recursive:true});
 for(const {destination,bytes}of imports)await fs.writeFile(destination,bytes);
 await fs.writeFile(path.join(root,'assets/catalog.json'),JSON.stringify(catalog,null,2)+'\n');
 return catalog;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node tools/import-book-pages.mjs /path/to/canonical/goosnav-3D-assets');
 const catalog=await importBookPages(path.resolve(process.argv[2]));
 console.log(`Imported ${catalog.comics.length} exact interiors (141 numbered pages plus title, copyright and blank).`);
}
