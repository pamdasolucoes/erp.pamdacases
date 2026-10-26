import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProductsService, PRODUCT_COLUMNS, KIT_COMPONENT_COLUMNS } from '../src/services/products';
import { catalogNumber, mapProductCatalog, safeProductImage, searchProducts, selectCatalogProducts } from '../src/services/productMapping';
import { officialCatalogFixture, kitId, productId } from './fixtures/officialProducts';
import { captureProductPricing, buildPriceReview, calculateSalePricing } from '../src/services/salePricing';
import { uuid } from './fixtures/customerRows';

function backend(options: { limit?:number; error?:string; authenticated?:boolean; empty?:boolean } = {}) {
  const fixture=officialCatalogFixture(); const calls:{table:string;from:number;to:number}[]=[];
  const client={
    auth:{getUser:async()=>({data:{user:options.authenticated===false ? null : {id:uuid(99)}},error:null})},
    from(table:string) {
      let from=0,to=0;
      const request={
        select(columns:string,config:unknown) { assert.equal(columns,table==='erp_product_catalog' ? PRODUCT_COLUMNS : KIT_COMPONENT_COLUMNS); assert.deepEqual(config,{count:'exact'}); return request; },
        order(column:string) { assert.equal(column,'id'); return request; },
        range(start:number,end:number) { from=start;to=end;return request; },abortSignal(){return request;},
        then(resolve:(value:unknown)=>void) {
          calls.push({table,from,to});
          const rows=options.empty ? [] : table==='erp_product_catalog' ? fixture.products : fixture.components;
          resolve({data:options.error ? null : rows.slice(from,Math.min(to+1,from+(options.limit || 100))),count:rows.length,error:options.error ? {code:options.error} : null});
        },
      }; return request;
    },
  } as unknown as SupabaseClient;
  return {client,calls,fixture};
}
test('le 637 produtos oficiais e 634 vinculos sem truncar limite de servidor menor que 100',async()=>{
  const fake=backend({limit:37}); const before=structuredClone(fake.fixture);
  const rows=await new ProductsService(fake.client).list();
  assert.equal(rows.length,637); assert.equal(rows.filter(row=>row.type==='fisico').length,316);
  assert.equal(rows.filter(row=>row.type==='servico').length,4); assert.equal(rows.filter(row=>row.type==='kit').length,317);
  assert.equal(rows.flatMap(row=>row.components).length,634);
  assert.ok(rows.filter(row=>row.type==='kit').every(row=>row.components.length===2));
  assert.equal(fake.calls.filter(call=>call.table==='erp_product_catalog')[1].from,37);
  assert.deepEqual(fake.fixture,before);
});
test('componentes, UUIDs, codigo TEXT, SKU, estoque nao conferido e NULL permanecem exatos',()=>{
  const fixture=officialCatalogFixture(); fixture.products[0].code=' 000201-A '; fixture.products[0].sku='SKU-Original  ';
  const rows=mapProductCatalog(fixture.products,fixture.components);
  assert.equal(rows[0].code,' 000201-A '); assert.equal(rows[0].sku,'SKU-Original  '); assert.equal(rows[0].id,productId(1));
  assert.equal(rows[1].currentCost,null); assert.equal(rows[1].managerialCost,0); assert.equal(rows[2].salePrice,null);
  assert.equal(rows[0].currentInventory,0); assert.equal(rows[0].stockVerified,false);
  const kit=rows.find(row=>row.id===kitId(1))!;
  assert.equal(kit.components[0].componentProductId,productId(1));
  assert.equal(kit.components[0].id,fixture.components[0].id);
  assert.equal(kit.components[0].componentName,rows[0].name);
  assert.equal(kit.components[0].kitProductId,kit.id);
  assert.equal(catalogNumber('0.00'),0); assert.equal(catalogNumber('25.00'),25); assert.equal(catalogNumber(null),null);
  for(const value of [undefined,'','NaN','Infinity']) assert.throws(()=>catalogNumber(value as any));
});
test('busca compartilhada por codigo, nome e SKU e miniaturas opcionais seguras',()=>{
  const fixture=officialCatalogFixture(); const rows=mapProductCatalog(fixture.products,fixture.components);
  for(const query of ['20201','TPU personalizada','SKU-KIT-1']) assert.equal(searchProducts(rows,query)[0].id,kitId(1));
  assert.equal(searchProducts(rows,'IMPRESSAO')[0].type,'servico');
  assert.equal(safeProductImage(null),null); assert.equal(safeProductImage('javascript:alert(1)'),null);
  assert.equal(safeProductImage('data:image/svg+xml,test'),null);
  assert.equal(safeProductImage(rows[0].imageUrl),rows[0].imageUrl);
});

test('catálogo oculta arquivados por padrão e ordena kits antes das bases sem remover componentes',()=>{
  const fixture=officialCatalogFixture();
  fixture.products.find(p=>p.id===kitId(1))!.active=false;
  fixture.products.find(p=>p.id===productId(1))!.active=false;
  const rows=mapProductCatalog(fixture.products,fixture.components), before=structuredClone(rows);
  const active=selectCatalogProducts(rows,'iPhone 11');
  assert.deepEqual(active.map(p=>p.type),['kit','kit','fisico','fisico']);
  assert.deepEqual(selectCatalogProducts(rows,'iPhone 11','todos','arquivados').map(p=>p.id),[kitId(1),productId(1)]);
  assert.deepEqual(selectCatalogProducts(rows,'iPhone 11','todos','todos').map(p=>p.type),['kit','kit','kit','fisico','fisico','fisico']);
  assert.deepEqual(selectCatalogProducts(rows,'iPhone 11','fisico','arquivados').map(p=>p.id),[productId(1)]);
  assert.equal(selectCatalogProducts(rows,rows.find(p=>p.id===kitId(1))!.sku).length,0);
  assert.ok(selectCatalogProducts(rows,'').slice(0,80).every(p=>p.type==='kit'));
  assert.equal(rows.find(p=>p.id===kitId(1))!.components.length,2);
  assert.deepEqual(rows,before);
});
test('sem identidade, permissao, conexao ou lista completa nao retorna dados de demonstracao',async()=>{
  const missing=backend({authenticated:false}); await assert.rejects(new ProductsService(missing.client).list(),/Sessão/); assert.equal(missing.calls.length,0);
  await assert.rejects(new ProductsService(backend({error:'42501'}).client).list(),/permissão/);
  await assert.rejects(new ProductsService(backend({error:'network'}).client).list(),/conexão/);
  assert.deepEqual(await new ProductsService(backend({empty:true}).client).list(),[]);
  const fixture=officialCatalogFixture();
  assert.throws(()=>mapProductCatalog(fixture.products.slice(1),fixture.components),/Componente indisponível/);
  assert.throws(()=>mapProductCatalog([...fixture.products,fixture.products[0]],fixture.components),/repetido/);
  assert.throws(()=>mapProductCatalog(fixture.products,[...fixture.components,fixture.components[0]]),/repetido/);
  assert.throws(()=>mapProductCatalog([{...fixture.products[0],code:201} as any],[]),/TEXT/);
  const controller=new AbortController(); controller.abort();
  await assert.rejects(new ProductsService(backend().client).list(controller.signal),/abort/i);
});
test('preparacao usa referencia oficial, mantem NULL e bloqueia autorizacao de demonstracao',()=>{
  const fixture=officialCatalogFixture(); const rows=mapProductCatalog(fixture.products,fixture.components);
  const snapshot=captureProductPricing(rows.find(row=>row.id===kitId(1))!,rows,'2026-10-16T12:00:00Z');
  assert.equal(snapshot.catalogSource,'supabase'); assert.equal(snapshot.originalUnitPriceCents,2500); assert.equal(snapshot.directUnitCostMicros,4300000);
  const item={id:uuid(1),snapshot,quantityInput:'1',priceInput:'20,00',reason:'Negociado'};
  assert.throws(()=>buildPriceReview(calculateSalePricing([item],'0'),uuid(2),''),/catálogo oficial/);
  const unknown=captureProductPricing(rows[2],rows,'2026-10-16T12:00:00Z');
  assert.equal(unknown.originalUnitPriceCents,null);
  const result=calculateSalePricing([{...item,snapshot:unknown,priceInput:'12,00'}],'0');
  assert.equal(result.totals!.catalogCents,null); assert.equal(result.totals!.priceDifferenceCents,null); assert.equal(result.totals!.netCents,1200);
});
