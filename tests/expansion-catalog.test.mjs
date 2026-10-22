import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadCatalog} from '../src/library.mjs';
import {resolveScript} from '../src/contracts.mjs';

test('bundled expansion offers both eye styles and all four optional scenes',async()=>{
  const catalog=await loadCatalog();
  for(const id of ['cowboy','glasses','crooked','astronaut'])for(const suffix of ['','-beady']){
    const variant=catalog.variants.find(v=>v.id===id+suffix);
    assert.ok(variant,`Missing ${id+suffix}`);
    assert.ok(catalog.assets[variant.asset]?.path.startsWith('assets/'));
    if(id==='astronaut')assert.deepEqual(variant.allowedScenes,['moon-base','tv-studio']);
  }
  for(const id of ['diner','basement','moon-base','tv-studio']){
    const scene=catalog.scenes.find(s=>s.id===id);
    assert.equal(scene.default,false);
    assert.ok(catalog.assets[scene.asset]?.path.startsWith('assets/environments/'));
    assert.ok(catalog.templates.every(t=>t.scenes.includes(id)));
  }
  const script=JSON.parse(await readFile(new URL('../examples/moon-reading.json',import.meta.url),'utf8'));
  const resolved=resolveScript(script,catalog);
  assert.equal(resolved.scene,'moon-base');
  assert.equal(resolved.characters.friend,'astronaut-beady');
  assert.deepEqual(resolveScript(resolved,catalog),resolved);
});
