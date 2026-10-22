import test from 'node:test';
import assert from 'node:assert/strict';
import { searchSaleCustomers, searchSaleProducts } from '../src/services/saleSearch';
import { mapCustomer, mapBranch } from '../src/services/customerMapping';
import { mapProductCatalog } from '../src/services/productMapping';
import { captureProductPricing } from '../src/services/salePricing';
import { createReceiptPreview } from '../src/services/receiptPreview';
import { checkDraftStock } from '../src/services/draftStock';
import { customerRow, branchRow, uuid } from './fixtures/customerRows';
import { officialCatalogFixture, kitId, productId } from './fixtures/officialProducts';
import type { PricingDraftItem } from '../src/types/salePricing';

const fixture=officialCatalogFixture();
const products=mapProductCatalog(fixture.products,fixture.components);
const branch=mapBranch(branchRow(350,{
  address:'Rua William Booth',number:'2697',complement:'Loja 05',neighborhood:'Boqueirão',
  city:'Curitiba',state:'PR',zip_code:'81730-080',phone:'(41) 99999-0000',
}));
const customer=mapCustomer(customerRow(350,{customer_code:'350',name:'Cristal Centro'}),[branch]);
const item:PricingDraftItem={id:'item-1',snapshot:captureProductPricing(products.find(p=>p.id===kitId(1))!,products,'2026-10-16T12:00:00Z'),quantityInput:'2',priceInput:'20,00',reason:'Negociação',customization:{model:'iPhone 11',color:'Azul',walletFaces:'2'}};
const input={customer,branch,items:[item],discount:'5,00',freight:{customerId:customer.id,defaultFreight:{status:'integration_pending' as const},chargedCents:0,source:'manual' as const,reason:'Retirada',realDeliveryCostCents:null},notes:'<script>alert(1)</script>',seller:{id:uuid(999),username:'vendedor',name:'Vendedor Teste',role:'venda_atendimento' as const,active:true,createdAt:'2026-10-16'},generatedAt:'2026-10-16T12:00:00Z'};

test('código exato não confunde documentos, nomes nem zeros à esquerda; nomes mantêm UUIDs',()=>{
  const others=[mapCustomer(customerRow(1,{customer_code:'000350',name:'Cristal Norte'}),[]),mapCustomer(customerRow(2,{name:'Loja 350',cnpj:'35000000000100'}),[])];
  assert.deepEqual(searchSaleCustomers([customer,...others],'350').map(c=>c.id),[customer.id]);
  assert.deepEqual(searchSaleCustomers([customer,...others],'000350').map(c=>c.customerCode),['000350']);
  assert.equal(searchSaleCustomers([customer,...others],'CRÍSTAL').length,2);
  assert.equal(customer.customerCode,'350');
});

test('catálogo completo prioriza kits, encontra código e SKU e não cruza tokens de campos diferentes',()=>{
  assert.equal(products.length,637);
  const matches=searchSaleProducts(products,'iPhone 11');
  assert.equal(matches.length,6); assert.ok(matches.slice(0,3).every(p=>p.type==='kit'));
  assert.ok(matches.slice(3).every(p=>p.type==='fisico'));
  for(const query of ['IPH11','SAMA10','MOTG35','Redmi Note 13']) assert.ok(searchSaleProducts(products,query).length>0,query);
  assert.deepEqual(searchSaleProducts(products,'201').map(p=>p.id),[productId(1)]);
  assert.deepEqual(searchSaleProducts(products,'20201').map(p=>p.id),[kitId(1)]);
  assert.equal(searchSaleProducts([{...products[0],name:'iPhone 12',modelPhone:'iPhone 12',sku:'SKU-11'}],'iPhone 11').length,0);
});

test('produtos arquivados não aparecem na busca de novas vendas e conservam seus dados',()=>{
  const archived = {...products[0],active:false};
  const catalog = [archived, products[1]];
  const before = structuredClone(catalog);
  for (const query of [archived.code, archived.sku, archived.name, '']) {
    assert.ok(searchSaleProducts(catalog,query).every(product=>product.id!==archived.id));
  }
  assert.deepEqual(searchSaleProducts(catalog,products[1].code).map(product=>product.id),[products[1].id]);
  assert.deepEqual(catalog,before);
  assert.equal(item.snapshot.productSku,products.find(product=>product.id===kitId(1))!.sku);
});

test('estoque provisório permite prévia; estoque conferido soma componentes compartilhados',()=>{
  assert.equal(checkDraftStock([item],products).errors.length,0);
  assert.ok(checkDraftStock([item],products).warnings.length>0);
  const verified=products.map(p=>p.id===productId(1)?{...p,stockVerified:true,currentInventory:2}:p);
  assert.equal(checkDraftStock([item],verified).errors.length,0);
  const physical={...item,id:'item-2',snapshot:captureProductPricing(verified.find(p=>p.id===productId(1))!,verified,input.generatedAt),quantityInput:'1'};
  assert.ok(checkDraftStock([item,physical],verified).errors.length>0);
});

test('prévia isola snapshot, aplica desconto uma vez e conserva frete zero e personalização',()=>{
  const preview=createReceiptPreview(input);
  assert.equal(preview.condition,'');
  assert.equal(createReceiptPreview({...input,paymentCondition:'PIX verificado · À vista verificado'}).condition,'PIX verificado · À vista verificado');
  assert.equal(preview.kind,'preview'); assert.equal(preview.receiptNumber,null); assert.equal(preview.payment,null);
  assert.equal(preview.totalCents,3500); assert.equal(preview.subtotalCents,4000); assert.equal(preview.discountCents,500); assert.equal(preview.freightCents,0);
  assert.equal(preview.customerCode,'350'); assert.equal(preview.items[0].sku,item.snapshot.productSku);
  assert.equal(preview.address,'Rua William Booth, 2697, Loja 05\nBoqueirão - Curitiba/PR');
  assert.equal(preview.customerContact,'CEP 81730-080 | Contato: (41) 99999-0000');
  assert.equal(preview.branchName,null);
  assert.equal(preview.items[0].customization?.walletFaces,'2');
  assert.equal(item.snapshot.originalUnitPriceCents,2500);
  preview.items[0].customization!.model='Outro'; assert.equal(item.customization!.model,'iPhone 11');
  assert.equal(createReceiptPreview({...input,freight:{...input.freight,chargedCents:1200}}).totalCents,4700);
});

test('prévia rejeita contexto incompleto ou divergente e valores inválidos',()=>{
  for(const patch of [{customer:null},{branch:null},{seller:null},{branch:{...branch,customerId:uuid(1)}},{items:[]},{discount:'-1'},{freight:{...input.freight,customerId:uuid(1)}},{freight:{...input.freight,chargedCents:null}},{generatedAt:'inválida'}]) assert.throws(()=>createReceiptPreview({...input,...patch}));
});
