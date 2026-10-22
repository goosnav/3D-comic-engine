import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

let compiled;
export async function loadNodeFlite() {
  if (!compiled) {
    compiled = readFile(createRequire(import.meta.url).resolve('@echogarden/flite-wasi'))
      .then(bytes => WebAssembly.compile(bytes)).catch(error => { compiled = undefined; throw error; });
  }
  return compiled;
}
