import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPriceReview, calculateSalePricing, captureProductPricing, parsePriceInput } from '../src/services/salePricing';
import { draft, pricingCatalog, product } from './fixtures/pricingProducts';
import { uuid } from './fixtures/customerRows';
test('reais aceitam virgula/ponto e ate dois decimais sem valores negativos ou invalidos', () => {
  for (const [input,cents] of [['0',0],['0,00',0],['12,34',1234],['12.34',1234],['01,2',120],['12,',1200]] as const) assert.equal(parsePriceInput(input),cents);
  for (const input of ['', ' ', '-0.01','-1','1.001','1,234','NaN','Infinity','1e3','1.234,56','9007199254740992']) assert.equal(parsePriceInput(input),null);
});
test('kit custa soma dos componentes atuais, sem confiar em custo stale do kit ou de sua composicao', () => {
  const catalog=pricingCatalog(); const before=structuredClone(catalog);
  const snapshot=captureProductPricing(catalog[2],catalog,'2026-10-15T12:00:00Z');
  assert.equal(snapshot.directUnitCostMicros,4300000);
  assert.equal(snapshot.managerialUnitCostMicros,5000000);
  assert.equal(snapshot.originalUnitPriceCents,2500);
  assert.deepEqual(catalog,before);
  catalog[0].currentCost=99; catalog[2].salePrice=99; catalog[2].managerialCost=99; catalog[2].components![0].quantity=99;
  assert.equal(snapshot.directUnitCostMicros,4300000); assert.equal(snapshot.components[0].quantity,1); assert.equal(snapshot.originalUnitPriceCents,2500);
});
test('produto fisico e servico usam seu proprio preco e custo sem custo gerencial ficticio', () => {
  const catalog=pricingCatalog();
  const items=catalog.slice(0,2).map((source,index)=>({ id:uuid(index+1),snapshot:captureProductPricing(source,catalog,'2026-10-15T12:00:00Z'),priceInput:index===0 ? '8,00' : '15,00',quantityInput:'1',reason:'' }));
  const result=calculateSalePricing(items,'0');
  assert.deepEqual(items.map(item=>item.snapshot.originalUnitPriceCents),[1000,2000]);
  assert.deepEqual(result.lines.map(line=>line.directCostCents),[250,180]);
  assert.equal(result.totals!.netCents,2300); assert.equal(result.totals!.grossProfitCents,1870);
  assert.equal(result.totals!.managerialCostCents,null);
});
test('negociacao e desconto adicional sao aplicados uma unica vez e calculam margens liquidas', () => {
  const result=calculateSalePricing([draft('20,00','2')],'5,00');
  assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.totals,{ catalogCents:5000,negotiatedCents:4000,priceDifferenceCents:-1000,additionalDiscountCents:500,netCents:3500,
    directCostCents:860,managerialCostCents:1000,grossProfitCents:2640,grossMarginPercent:2640/3500*100,managerialResultCents:2500,managerialMarginPercent:2500/3500*100 });
  assert.equal(result.lines[0].netCents,3500);
});
test('preco maior que catalogo e restauracao nao alteram custo nem preco original', () => {
  const item=draft('30,00');
  assert.equal(calculateSalePricing([item],'0').totals!.priceDifferenceCents,500);
  assert.equal(calculateSalePricing([{...item,priceInput:'25,00'}],'0').totals!.netCents,2500);
  assert.equal(item.snapshot.originalUnitPriceCents,2500);
});
test('rateio por maiores restos conserva cada centavo e nao depende de floats', () => {
  const items=[draft('0,01','1',uuid(1)),draft('0,01','1',uuid(2)),draft('0,01','1',uuid(3))];
  const result=calculateSalePricing(items,'0,02');
  assert.deepEqual(result.lines.map(line=>line.additionalDiscountCents),[1,1,0]);
  assert.equal(result.totals!.netCents,1);
  assert.equal(result.lines.reduce((sum,line)=>sum+line.netCents,0),1);
});
test('abaixo de custo direto ou gerencial exige autorizacao, inclusive apos desconto adicional', () => {
  assert.equal(calculateSalePricing([draft('4,50')],'0').lines[0].requiresAuthorization,true);
  assert.equal(calculateSalePricing([draft('4,50')],'0').lines[0].belowDirectCost,false);
  assert.equal(calculateSalePricing([draft('4,00')],'0').lines[0].belowDirectCost,true);
  assert.equal(calculateSalePricing([draft('5,00')],'0,01').lines[0].requiresAuthorization,true);
  assert.equal(calculateSalePricing([draft('5,00')],'0').lines[0].requiresAuthorization,false);
});
test('zero e permitido, com prejuizo e margens nao calculaveis; custo gerencial ausente nao e inventado', () => {
  const result=calculateSalePricing([draft('0')],'0');
  assert.equal(result.totals!.grossProfitCents,-430); assert.equal(result.totals!.grossMarginPercent,null);
  assert.equal(result.totals!.managerialMarginPercent,null); assert.equal(result.lines[0].requiresAuthorization,true);
  const source=product(); const snapshot=captureProductPricing(source,[source],'2026-10-15T12:00:00Z');
  const missing=calculateSalePricing([{...draft(),snapshot}],'0');
  assert.equal(missing.totals!.managerialCostCents,null); assert.equal(missing.totals!.managerialResultCents,null);
  source.managerialCost=0;
  assert.equal(captureProductPricing(source,[source],'2026-10-15T12:00:00Z').managerialUnitCostMicros,0);
});
test('catalogo incompleto, composicao circular e valores invalidos nao geram lucro ficticio', () => {
  const catalog=pricingCatalog();
  const missing=captureProductPricing(catalog[2],[catalog[2]],'2026-10-15T12:00:00Z');
  assert.equal(missing.directUnitCostMicros,null);
  const result=calculateSalePricing([{...draft(),snapshot:missing}],'0');
  assert.equal(result.totals!.grossProfitCents,null);
  assert.throws(()=>buildPriceReview(result,uuid(5),''),/custo direto conhecido/);
  catalog[2].components![0].componentProductId=catalog[2].id;
  assert.equal(captureProductPricing(catalog[2],catalog,'2026-10-15T12:00:00Z').directUnitCostMicros,null);
  for (const item of [draft('-1'),draft('1,001'),draft(''),draft('1','0'),draft('1','1.5'),draft('90071992547409.91','2')]) assert.equal(calculateSalePricing([item],'0').totals,null);
  for (const discount of ['-1','0.001','26','']) assert.equal(calculateSalePricing([draft()],discount).totals,null);
});
test('revisao carrega snapshots, motivos, cliente e unidade; motivo e exigido para aprovar abaixo do custo', () => {
  const result=calculateSalePricing([draft('4,00')],'0,01');
  assert.throws(()=>buildPriceReview(result,uuid(10),''),/motivo/);
  const review=buildPriceReview(result,uuid(10),'Desconto combinado',uuid(20),uuid(21));
  assert.equal(review.scope,'demo_only'); assert.equal(review.items[0].directCostCents,430);
  assert.equal(review.items[0].netCents,399); assert.equal(review.customerId,uuid(20));
  assert.throws(()=>buildPriceReview(calculateSalePricing([{...draft('4'),reason:''}],'0'),uuid(10),''),/motivo/);
});
