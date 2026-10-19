import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingBackend} from './fixtures/pendingSalesBackend';
import {uuid} from './fixtures/customerRows';
import {emptySalePreparation} from '../src/services/salePreparation';
import {pendingSaleArgs,pendingFingerprint,preparationFromSale} from '../src/services/pendingSaleMapping';

import {PreparationStore} from '../src/services/preparationStore';
import {PendingDraftSync} from '../src/services/pendingDraftSync';
import {captureProductPricing} from '../src/services/salePricing';
import {mapProductCatalog} from '../src/services/productMapping';

test('início usa exatamente o contrato, repete chave sem duplicação e impede reutilização incompatível',async()=>{
  const {service,user,backend}=pendingBackend();const key=uuid(8000);
  const id=await service.start(user.id,uuid(1),uuid(1001),key);
  assert.equal(await service.start(user.id,uuid(1),uuid(1001),key),id);
  assert.equal(backend.sales.length,1);assert.equal(backend.items.length,0);
  assert.deepEqual(backend.writes[0].body,{p_cliente_id:uuid(1),p_filial_id:uuid(1001),p_draft_key:key});
  await assert.rejects(()=>service.start(user.id,uuid(2),uuid(1002),key));
  assert.equal(backend.events.filter(e=>e.event_type==='sale_started').length,1);
});

test('contrato de salvamento aceita vazio/frete nulo, mantém UUID e não aceita retorno divergente',async()=>{
  const {service,user,backend,setInvalidSaveReturn}=pendingBackend();
  const id=await service.start(user.id,uuid(1),uuid(1001),uuid(8000));
  const draft=emptySalePreparation(user.id);draft.customerId=uuid(1);draft.branchId=uuid(1001);
  const args=pendingSaleArgs(draft,id);assert.equal(args.p_frete,null);assert.deepEqual(args.p_itens,[]);
  assert.deepEqual(Object.keys(args).sort(),['p_cliente_id','p_filial_id','p_itens','p_frete','p_desconto','p_motivo','p_observacoes','p_venda_id','p_forma_id','p_prazo_id'].sort());
  await service.save(user.id,args);assert.equal(backend.sales.length,1);
  setInvalidSaveReturn(true);await assert.rejects(()=>service.save(user.id,args),/venda esperada/);
});

test('mapeamento aplica desconto uma vez, preserva personalização/pagamento e não altera catálogo',async()=>{
  const {service,user,backend,fixture}=pendingBackend();const id=await service.start(user.id,uuid(1),uuid(1001),uuid(8000));
  const products=mapProductCatalog(fixture.products,fixture.components);const draft=emptySalePreparation(user.id);draft.customerId=uuid(1);draft.branchId=uuid(1001);
  draft.pricing={...draft.pricing,items:[{id:'line',snapshot:captureProductPricing(products[0],products,'2026-10-16T12:00:00Z'),quantityInput:'2',priceInput:'20,00',reason:'Preço aprovado',customization:{model:'iPhone',color:'Preto',walletFaces:'2',extra:'preservado'}}],discount:'5,00',discountReason:'Aprovado',freight:'0,00',manualFreight:true,notes:'Observações'};
  draft.paymentMethodId=uuid(7000);draft.paymentTermId=uuid(7001);
  await service.save(user.id,pendingSaleArgs(draft,id));assert.equal(backend.sales[0].total,35);
  const restored=preparationFromSale(user.id,await service.details(user.id,id));
  assert.equal(restored.pricing.items[0].priceInput,'20,00');assert.equal(restored.pricing.items[0].reason,'Preço aprovado');assert.equal(restored.pricing.items[0].customization!.extra,'preservado');
  assert.equal(restored.paymentMethodId,draft.paymentMethodId);assert.equal(restored.paymentTermId,draft.paymentTermId);
  assert.equal(restored.pricing.items[0].snapshot.directUnitCostMicros,null);assert.equal(restored.pricing.items[0].snapshot.originalUnitPriceCents,null);
  assert.equal(fixture.products[0].sale_price,10);assert.equal(backend.inventoryWrites+backend.financialWrites,0);
  assert.equal(restored.remote!.savedFingerprint,pendingFingerprint(restored));
});

test('limites e valores inválidos não são enviados; desconto positivo exige motivo',()=>{
  const draft=emptySalePreparation(uuid(9000));draft.customerId=uuid(1);draft.branchId=uuid(1001);
  draft.pricing.freight='-1';assert.throws(()=>pendingSaleArgs(draft,uuid(9001)),/frete válido/);
  draft.pricing.freight='';draft.pricing.discount='-1';assert.throws(()=>pendingSaleArgs(draft,uuid(9001)),/Corrija/);
  draft.pricing.discount='0';draft.pricing.items=Array(201).fill({});assert.throws(()=>pendingSaleArgs(draft,uuid(9001)),/200/);
});

test('permissões são consultadas no backend com o nome real do argumento OpenAPI',async()=>{
  const admin=pendingBackend();assert.equal(await admin.service.hasPermission(admin.user.id,'sales.cancel'),true);
  const seller=pendingBackend('venda_atendimento');assert.equal(await seller.service.hasPermission(seller.user.id,'sales.cancel'),false);
  seller.backend.permissions['sales.cancel']=true;assert.equal(await seller.service.hasPermission(seller.user.id,'sales.cancel'),true);
});

test('cancelamento exige permissão e motivo, preserva evento/registro e rejeita confirmadas',async()=>{
  const admin=pendingBackend();const id=await admin.service.start(admin.user.id,uuid(1),uuid(1001),uuid(8000));
  await assert.rejects(()=>admin.service.cancel(admin.user.id,id,'Solicitação'),/produtos/);
  await admin.service.save(admin.user.id,{p_cliente_id:uuid(1),p_filial_id:uuid(1001),p_itens:[{product_id:admin.fixture.products[0].id,quantity:1,unit_price:Number(admin.fixture.products[0].sale_price),customization:{}}],p_frete:null,p_desconto:0,p_motivo:null,p_observacoes:null,p_venda_id:id,p_forma_id:null,p_prazo_id:null});
  await assert.rejects(()=>admin.service.cancel(admin.user.id,id,' '),/motivo/);
  const details=await admin.service.cancel(admin.user.id,id,'Solicitação');assert.equal(details.sale.status,'cancelled');assert.equal(admin.backend.sales.length,1);assert.ok(details.events.some(e=>e.event_type==='sale_cancelled'));
  const seller=pendingBackend('venda_atendimento');const sellerId=await seller.service.start(seller.user.id,uuid(1),uuid(1001),uuid(8000));
  await assert.rejects(()=>seller.service.cancel(seller.user.id,sellerId,'Tentativa'),/permissão/);assert.equal(seller.backend.sales[0].status,'draft');
  admin.backend.sales[0].status='confirmed';await assert.rejects(()=>admin.service.cancel(admin.user.id,id,'Estorno'),/pendências/);
});

test('troca de identidade bloqueia requisição antes da escrita',async()=>{
  const {service,user,backend}=pendingBackend();const original=user.id;user.id=uuid(99);
  await assert.rejects(()=>service.start(original,uuid(1),uuid(1001),uuid(8000)),/sessão mudou/);assert.equal(backend.writes.length,0);
});

test('perfil sem sales.draft e sessão inativa não iniciam pendências',async()=>{
  const production=pendingBackend('producao');
  await assert.rejects(()=>production.service.start(production.user.id,uuid(1),uuid(1001),uuid(8000)),/permissão/);
  assert.equal(production.backend.sales.length,0);
  const inactive=pendingBackend();inactive.user.active=false;
  await assert.rejects(()=>inactive.service.start(inactive.user.id,uuid(1),uuid(1001),uuid(8000)),/sessão mudou/);
  assert.equal(inactive.backend.writes.length,0);
});

test('lista e histórico de eventos percorrem todas as páginas do servidor sem agrupar cadastros',async()=>{
  const {service,user,backend}=pendingBackend();
  for(let index=1;index<=125;index++)await service.start(user.id,uuid(1),uuid(1001),uuid(8000+index));
  assert.equal((await service.list(user.id)).length,125);
  const sale=backend.sales[0];const original=backend.events.find(event=>event.sale_id===sale.id)!;
  for(let index=0;index<80;index++)backend.events.push({...original,id:uuid(900000+index),event_type:'draft_saved'});
  const details=await service.details(user.id,sale.id);assert.equal(details.events.length,81);
  assert.ok(details.events.every(event=>event.sale_id===sale.id));
  assert.equal(backend.inventoryWrites+backend.financialWrites,0);
});

test('sincronizador preserva chave após resposta perdida e não perde mudanças durante início',async()=>{
  const {service,user,backend}=pendingBackend();backend.failStartAfterCommit=true;
  const storage=new Map<string,string>();const store=new PreparationStore(user.id,'isolated',{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{storage.set(key,value);}});
  store.update(previous=>({...previous,customerId:uuid(1),branchId:uuid(1001)}));
  const sync=new PendingDraftSync(store,service,()=>true);sync.begin();await sync.flush();
  assert.equal(sync.getSnapshot().status,'error');const key=store.getSnapshot().remote!.draftKey;
  await sync.retry();assert.equal(await sync.flush(),true);assert.equal(store.getSnapshot().remote!.draftKey,key);assert.equal(backend.sales.length,1);
  store.update(previous=>({...previous,pricing:{...previous.pricing,notes:'mais recente'}}));await sync.flush();assert.equal(backend.sales[0].notes,'mais recente');
  sync.dispose();
});

test('reverter edição durante debounce ou gravação não envia snapshot antigo nem anuncia salvo prematuramente',async()=>{
  const {service,user,backend}=pendingBackend();const store=new PreparationStore(user.id,'isolated',null);
  store.update(previous=>({...previous,customerId:uuid(1),branchId:uuid(1001)}));
  const sync=new PendingDraftSync(store,service,()=>true);sync.begin();await sync.flush();
  const before=backend.writes.length;
  store.update(previous=>({...previous,pricing:{...previous.pricing,notes:'temporário'}}));
  store.update(previous=>({...previous,pricing:{...previous.pricing,notes:''}}));
  await new Promise(resolve=>setTimeout(resolve,280));assert.equal(backend.writes.length,before);
  backend.saveDelay=30;
  store.update(previous=>({...previous,pricing:{...previous.pricing,notes:'em trânsito'}}));const first=sync.flush();
  await new Promise(resolve=>setTimeout(resolve,5));
  store.update(previous=>({...previous,pricing:{...previous.pricing,notes:''}}));
  assert.notEqual(sync.getSnapshot().status,'saved');await sync.flush();await first;
  assert.equal(backend.sales[0].notes,null);assert.equal(sync.getSnapshot().status,'saved');sync.dispose();
});
