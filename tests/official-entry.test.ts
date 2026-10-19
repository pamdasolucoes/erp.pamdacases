import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

test('grafo de imports do aplicativo não carrega banco demonstrativo nem administração legada', () => {
  const result = buildSync({ entryPoints: ['src/main.tsx'], bundle: true, write: false, metafile: true,
    packages: 'external', format: 'esm', external: ['*.css', '*.png'], logLevel: 'silent' });
  const paths = Object.keys(result.metafile!.inputs);
  assert.ok(paths.length > 25);
  assert.equal(paths.some(path => /[\\/]services[\\/](db|employees)\.ts$/.test(path)), false);
});
