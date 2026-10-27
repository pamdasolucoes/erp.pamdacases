import test from 'node:test';
import assert from 'node:assert/strict';
import {readAllPages} from '../src/services/readPages';

test('catálogo usa lotes maiores e concorrência limitada, preservando ordem e limite do servidor',async()=>{
 for(const cap of [37,100,500]){
  const source=Array.from({length:1637},(_,i)=>i);
  let active=0,peak=0,calls=0;
  const result=await readAllPages(async(from,to)=>{
   active++;calls++;peak=Math.max(peak,active);
   await new Promise(resolve=>setTimeout(resolve,1));active--;
   return {rows:source.slice(from,Math.min(to+1,from+cap)),total:source.length};
  },500,undefined,3);
  assert.deepEqual(result,source);assert.equal(peak,3);
  assert.equal(calls,Math.ceil(source.length/cap));
 }
});

test('mudança de contagem ou cancelamento durante lote paralelo impede catálogo parcial',async()=>{
 let calls=0;
 await assert.rejects(readAllPages(async(from,to)=>({rows:[from,to],total:++calls===1?10:11}),2,undefined,3),/mudou/);
 const abort=new AbortController();
 await assert.rejects(readAllPages(async()=>{abort.abort();return {rows:[1],total:1};},500,abort.signal,3),/abort/i);
});
