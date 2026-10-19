import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { setup } from '../browser/support/mockErp';

test('medição reproduzível de navegação, rede e custo de renderização', async ({ page }) => {
  const phase = process.env.PAMDA_PERF_PHASE || 'after';
  const js = readdirSync('dist/assets').filter(name => name.endsWith('.js')).map(name => {
    const bytes = readFileSync(`dist/assets/${name}`); return { name, bytes: bytes.length, gzip: gzipSync(bytes).length };
  });
  const loaded = new Set<string>();
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js')) loaded.add(url.pathname.split('/').pop()!); });
  const client = await page.context().newCDPSession(page); await client.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(row => [row.name, row.value]));
  const { state } = await setup(page, 'admin_gerencial', { stayOnDashboard: true, dataDelayMs: 20 });
  const loginBytes = js.filter(row => loaded.has(row.name)).reduce((sum, row) => sum + row.bytes, 0);
  const observations: Record<string, unknown>[] = [];
  for (let cycle = 0; cycle < 4; cycle++) {
    for (const screen of ['customers', 'products', 'sale'] as const) {
      const before = await metrics(), requests = { customers: state.reads, products: state.productReads }, start = performance.now();
      const label = { customers: 'Clientes e Unidades', products: 'Produtos & Serviços', sale: 'Nova Venda' }[screen];
      await page.getByRole('complementary').getByRole('button', { name: label, exact: true }).click();
      if (screen === 'customers') await expect(page.getByText('384 clientes acessíveis', { exact: true })).toBeVisible();
      if (screen === 'products') await expect(page.getByText(/637 itens oficiais/)).toBeVisible();
      if (screen === 'sale') await expect(page.getByRole('combobox', { name: 'Adicionar produto do catálogo oficial', exact: true })).toBeEnabled();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const after = await metrics();
      observations.push({ cycle, screen, elapsedMs: Math.round((performance.now() - start) * 10) / 10,
        customerRequests: state.reads - requests.customers, productRequests: state.productReads - requests.products,
        scriptMs: Math.round((after.ScriptDuration - before.ScriptDuration) * 10000) / 10,
        layoutMs: Math.round((after.LayoutDuration + after.RecalcStyleDuration - before.LayoutDuration - before.RecalcStyleDuration) * 10000) / 10,
        domNodes: await page.locator('main *').count(),
        listRows: screen === 'customers' ? await page.locator('[data-testid^="customer-row-"]').count() || await page.getByRole('region', { name: 'Lista de clientes' }).getByRole('button').count() : screen === 'products' ? await page.locator('[data-testid^="product-"]').count() : null });
    }
  }
  const report = { phase, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), fixture: { customers: 384, products: 637, kitComponents: 634, serverMaxRows: 37, latencyPerDataRequestMs: 20 },
    environment: 'Chrome headless / Windows / Vite production preview; synthetic intercepted API; no production latency measurement',
    bundle: { files: js, loginBytes, totalBytes: js.reduce((sum, row) => sum + row.bytes, 0), totalGzipBytes: js.reduce((sum, row) => sum + row.gzip, 0) }, observations };
  mkdirSync('docs/performance', { recursive: true }); writeFileSync(`docs/performance/${phase}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ phase, loginBytes, totalBytes: report.bundle.totalBytes, observations }));
});
