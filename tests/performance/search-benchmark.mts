import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mapCustomerCatalog, searchCustomers } from '../../src/services/customerMapping';
import { mapProductCatalog, searchProducts } from '../../src/services/productMapping';
import { searchSaleProducts } from '../../src/services/saleSearch';
import { officialCatalogFixture } from '../fixtures/officialProducts';
import { customerRow, branchRow } from '../fixtures/customerRows';
const customers = mapCustomerCatalog(Array.from({ length: 384 }, (_, index) => customerRow(index + 1)), Array.from({ length: 384 }, (_, index) => branchRow(index + 1)));
const fixture = officialCatalogFixture(), products = mapProductCatalog(fixture.products, fixture.components);
const queries = ['201', 'iphone 11', 'SKU-KIT-1', 'Capa', 'TPU', 'serviço', '20201', 'inexistente'];
let checksum = 0;
const measure = (search: (query: string) => readonly unknown[]) => {
  for (let index = 0; index < 30; index++) search(queries[index % queries.length]);
  const start = performance.now();
  for (let index = 0; index < 400; index++) checksum += search(queries[index % queries.length]).length;
  return Math.round((performance.now() - start) * 100) / 100;
};
const report = { phase: process.env.PAMDA_PERF_PHASE || 'after', synthetic: true, searchesPerFunction: 400,
  customerMs: measure(query => searchCustomers(customers, query)), productMs: measure(query => searchProducts(products, query)), saleProductMs: measure(query => searchSaleProducts(products, query)), checksum };
mkdirSync('docs/performance', { recursive: true }); writeFileSync(`docs/performance/${report.phase}-search.json`, JSON.stringify(report, null, 2) + '\n');
console.log(report);
