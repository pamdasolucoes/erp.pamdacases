import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureSaleFreight, customerFreightLabel, initialSaleFreight, pendingCustomerFreight, saleTotalWithFreight } from '../src/services/freight';
import { mapCustomer } from '../src/services/customerMapping';
import { buildCustomerUpdate, createCustomerForm } from '../src/views/customers/customerForm';
import { toCustomerUpdateRpc } from '../src/services/customerEdits';
import { customerRow, uuid } from './fixtures/customerRows';

test('frete pendente, NULL e zero configurado tem semanticas distintas',()=>{
  assert.equal(customerFreightLabel(pendingCustomerFreight),'Pendente de integração');
  assert.equal(customerFreightLabel({status:'available',amountCents:null}),'Não configurado');
  assert.match(customerFreightLabel({status:'available',amountCents:0}),/0,00/);
  assert.equal(initialSaleFreight(pendingCustomerFreight),'');
  assert.equal(initialSaleFreight({status:'available',amountCents:null}),'');
  assert.equal(initialSaleFreight({status:'available',amountCents:0}),'0,00');
});
test('padrao 10 permite cobrar 0 ou 15 sem alterar cliente e sem inferir custo real',()=>{
  const setting={status:'available',amountCents:1000} as const;
  const customer=mapCustomer(customerRow(),[]);
  assert.equal(initialSaleFreight(setting),'10,00');
  const free=captureSaleFreight(customer.id,setting,'0,00','Troca',true);
  const special=captureSaleFreight(customer.id,setting,'15,00','Entrega especial',true);
  assert.equal(free.chargedCents,0); assert.equal(special.chargedCents,1500); assert.equal(setting.amountCents,1000);
  assert.equal(free.defaultFreight.status,'available'); assert.equal(free.realDeliveryCostCents,null);
  assert.equal(saleTotalWithFreight(2000,'10,00').totalCents,3000);
  assert.equal(saleTotalWithFreight(2000,'0,00').totalCents,2000);
  assert.equal(saleTotalWithFreight(2000,'15,00').totalCents,3500);
});
test('frete invalido nao vira zero e nao se mistura aos descontos dos itens',()=>{
  for(const input of ['-1','1,001','NaN','Infinity']) assert.equal(saleTotalWithFreight(3500,input).totalCents,null);
  assert.deepEqual(saleTotalWithFreight(3500,''),{totalCents:3500,error:null});
  assert.equal(captureSaleFreight(null,pendingCustomerFreight,'','',false).chargedCents,0);
  assert.deepEqual(saleTotalWithFreight(3500,'10,00'),{totalCents:4500,error:null});
  assert.equal(saleTotalWithFreight(null,'10,00').totalCents,null);
  assert.equal(saleTotalWithFreight(Number.MAX_SAFE_INTEGER,'1,00').totalCents,null);
});
test('mapeamento lê frete oficial sem enviá-lo pela RPC cadastral',()=>{
  const customer=mapCustomer(customerRow(),[]);
  assert.deepEqual(customer.defaultFreight,{status:'available',amountCents:null});
  assert.deepEqual(mapCustomer(customerRow(1,{default_shipping_fee:0}),[]).defaultFreight,{status:'available',amountCents:0});
  assert.deepEqual(mapCustomer(customerRow(1,{default_shipping_fee:'12.50'}),[]).defaultFreight,{status:'available',amountCents:1250});
  const form=createCustomerForm(customer); form.values.phone='123';
  assert.deepEqual(toCustomerUpdateRpc(buildCustomerUpdate(customer,form)).p_changes,{phone:'123'});
  const update=buildCustomerUpdate(customer,form);
  assert.throws(()=>toCustomerUpdateRpc({...update,changes:{defaultFreight:1000} as any}),/protegido/);
  assert.equal(update.id,uuid(1)); assert.equal(customer.customerCode,'000001');
});
