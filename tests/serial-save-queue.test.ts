import test from 'node:test';
import assert from 'node:assert/strict';
import {SerialSaveQueue,type SaveQueueState} from '../src/services/serialSaveQueue';

test('salvamento é serial, coalesce edições pendentes e não anuncia sucesso de uma revisão antiga',async()=>{
  const calls:{value:{notes:string};finish:()=>void}[]=[];let concurrent=0,maxConcurrent=0;
  const queue=new SerialSaveQueue<{notes:string}>(value=>new Promise<void>(resolve=>{
    concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);
    calls.push({value,finish:()=>{concurrent--;resolve();}});
  }));
  const states:SaveQueueState[]=[];queue.subscribe(state=>states.push(state));
  const first={notes:'primeira'};queue.enqueue(first);await Promise.resolve();first.notes='mutação externa';
  queue.enqueue({notes:'intermediária'});queue.enqueue({notes:'mais recente'});
  assert.equal(calls.length,1);assert.equal(calls[0].value.notes,'primeira');
  calls[0].finish();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls.length,2);assert.equal(calls[1].value.notes,'mais recente');
  assert.ok(!states.some(state=>state.status==='saved'));calls[1].finish();
  assert.equal(await queue.flush(),true);assert.equal(maxConcurrent,1);
  assert.equal(queue.getState().savedRevision,3);assert.equal(queue.getState().status,'saved');
});

test('erro não perde a revisão pendente e retry somente informa salvo após confirmação',async()=>{
  const calls:unknown[]=[];let fail=true;
  const queue=new SerialSaveQueue(async value=>{calls.push(value);if(fail)throw new Error('rede');});
  queue.enqueue({items:[],freight:null});assert.equal(await queue.flush(),false);
  assert.equal(queue.getState().status,'error');assert.equal(queue.getState().savedRevision,0);
  fail=false;assert.equal(await queue.retry(),true);assert.deepEqual(calls,[{items:[],freight:null},{items:[],freight:null}]);
});

test('pausa aguarda requisição já enviada e impede novos salvamentos até retomar',async()=>{
  const calls:number[]=[];let finish!:()=>void;
  const queue=new SerialSaveQueue<number>(value=>{calls.push(value);return value===1?new Promise(resolve=>{finish=resolve;}):Promise.resolve();});
  queue.enqueue(1);await Promise.resolve();queue.enqueue(2);const pausing=queue.pause();
  finish();await pausing;assert.deepEqual(calls,[1]);assert.equal(await queue.flush(),false);
  queue.resume();assert.equal(await queue.flush(),true);assert.deepEqual(calls,[1,2]);
});

test('desinscrever a tela não cancela a gravação em andamento nem perde alterações posteriores',async()=>{
  const saved:number[]=[];const queue=new SerialSaveQueue<number>(async value=>{saved.push(value);});
  const unsubscribe=queue.subscribe(()=>{});queue.enqueue(1);unsubscribe();queue.enqueue(2);
  assert.equal(await queue.flush(),true);assert.deepEqual(saved,[2]);
});
