import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionCatalog } from '../src/services/sessionCatalog';

const deferred = <T>() => { let resolve!: (data: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
test('catálogo deduplica requisições simultâneas e reutiliza a mesma sessão sem persistência', async () => {
  let calls = 0; const pending = deferred<string[]>();
  const cache = new SessionCatalog(async () => { calls++; return pending.promise; }); cache.setScope('project-a:user-a');
  const first = cache.load(), second = cache.load(); assert.equal(first, second);
  await Promise.resolve(); assert.equal(calls, 1); pending.resolve(['oficial']); await first;
  assert.deepEqual(await cache.load(), ['oficial']); assert.equal(calls, 1);
  await cache.load(true); assert.equal(calls, 2);
});
test('logout e troca de projeto/usuário removem dados e respostas atrasadas não repovoam o cache', async () => {
  const pending = deferred<string[]>(); let signal!: AbortSignal;
  const cache = new SessionCatalog(async (_scope, abort) => { signal = abort; return pending.promise; });
  cache.setScope('project-a:user-a'); const old = cache.load(); await Promise.resolve();
  cache.setScope(null); assert.equal(signal.aborted, true); assert.equal(cache.getSnapshot().data, null);
  pending.resolve(['privado-a']); await assert.rejects(old, /substituída/);
  await assert.rejects(cache.load(), /sessão/);
  cache.setScope('project-a:user-b'); assert.equal(cache.getSnapshot().data, null);
  await cache.load(); cache.setScope('project-b:user-b'); assert.equal(cache.getSnapshot().data, null);
});
test('falha de revalidação limpa dados antigos; invalidação atualiza apenas consumidores ativos', async () => {
  let calls = 0, denied = false;
  const cache = new SessionCatalog(async () => { calls++; if (denied) throw new Error('RLS negada'); return ['oficial']; });
  cache.setScope('project:user'); await cache.load(); denied = true;
  await assert.rejects(cache.load(true), /RLS/); assert.equal(cache.getSnapshot().data, null);
  denied = false; await cache.load(); const unsubscribe = cache.subscribe(() => {}); cache.invalidate(); await cache.load(); assert.equal(calls, 4);
  unsubscribe(); cache.invalidate(); assert.equal(calls, 4); assert.equal(cache.getSnapshot().data, null);
  await cache.load(); cache.revalidate(); assert.equal(cache.getSnapshot().data, null); assert.equal(calls, 5);
});
test('registro confirmado substitui apenas seu cadastro e invalida leituras antigas da mesma sessão', async () => {
  let next = Promise.resolve([{ id: '1', name: 'Original' }, { id: '2', name: 'Outro' }]);
  const cache = new SessionCatalog(() => next); cache.setScope('project:user'); await cache.load();
  const pending = deferred<{ id: string; name: string }[]>(); next = pending.promise;
  const old = cache.load(true); await Promise.resolve();
  cache.replace('project:user', rows => rows.map(row => row.id === '1' ? { ...row, name: 'Confirmado' } : row));
  pending.resolve([{ id: '1', name: 'Antigo' }]); await assert.rejects(old, /substituída/);
  assert.deepEqual(cache.getSnapshot().data?.map(row => row.name), ['Confirmado', 'Outro']);
  cache.replace('other-project:user', () => []); assert.equal(cache.getSnapshot().data?.length, 2);
});
