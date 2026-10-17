import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultBranchId} from '../src/services/defaultBranch';
import {mapBranch,mapCustomer} from '../src/services/customerMapping';
import {emptySalePreparation,parseSalePreparation,serializeSalePreparation,salePreparationKey} from '../src/services/salePreparation';
import {customerRow,branchRow,uuid} from './fixtures/customerRows';
import {mapProductCatalog} from '../src/services/productMapping';
import {captureProductPricing} from '../src/services/salePricing';
import {officialCatalogFixture} from './fixtures/officialProducts';

test('unidade única é automática; matriz explícita é selecionada independentemente da ordem',()=>{
  const first=mapBranch(branchRow(1)); const second=mapBranch(branchRow(2,{customer_id:uuid(1),name:'Matriz',is_primary:true}));
  assert.equal(defaultBranchId(mapCustomer(customerRow(1),[first])),first.id);
  assert.equal(defaultBranchId(mapCustomer(customerRow(1),[first,second])),second.id);
  assert.equal(defaultBranchId(mapCustomer(customerRow(1),[second,first])),second.id);
});
test('nome Matriz não substitui marcador oficial; ambiguidade, ausência e inatividade exigem seleção manual',()=>{
  const first=mapBranch(branchRow(1,{name:'Matriz'})); const second=mapBranch(branchRow(2,{customer_id:uuid(1)}));
  for(const branches of [[],[first,second],[{...first,isPrimary:true},{...second,isPrimary:true}],[{...first,active:false}],[first,{...second,isPrimary:true,active:false}]]) assert.equal(defaultBranchId(mapCustomer(customerRow(1),branches)),'');
});
test('rascunho conserva campos e snapshots sem restaurar autorizações, credenciais ou outra identidade',()=>{
  const fixture=officialCatalogFixture(); const products=mapProductCatalog(fixture.products,fixture.components);
  const draft=emptySalePreparation(uuid(99)); draft.customerId=uuid(1);draft.branchId=uuid(1001);
  draft.pricing={...draft.pricing,items:[{id:'item',snapshot:captureProductPricing(products[0],products,'2026-10-16T12:00:00Z'),quantityInput:'2',priceInput:'19,99',reason:'Negociação',customization:{model:'Modelo',color:'Azul',walletFaces:'2'}}],discount:'5,00',discountReason:'Condição',freight:'0,00',freightReason:'Retirada',manualFreight:true,notes:'Observações'};
  const raw=serializeSalePreparation(draft);assert.deepEqual(parseSalePreparation(raw,draft.userId),draft);
  assert.equal(parseSalePreparation(raw,uuid(100)),null);
  assert.notEqual(salePreparationKey('project-a',draft.userId),salePreparationKey('project-b',draft.userId));
  assert.notEqual(salePreparationKey('project-a',draft.userId),salePreparationKey('project-a',uuid(100)));
  assert.equal(parseSalePreparation('{',draft.userId),null);
  assert.equal(parseSalePreparation(JSON.stringify({...draft,version:2}),draft.userId),null);
  assert.equal(parseSalePreparation(JSON.stringify({...draft,pricing:{...draft.pricing,items:[{}]}}),draft.userId),null);
  const untrusted=JSON.parse(raw);untrusted.pricing.events=[{kind:'authorization_simulated'}];untrusted.authorization={approved:true};
  assert.deepEqual(parseSalePreparation(JSON.stringify(untrusted),draft.userId),draft);
});
