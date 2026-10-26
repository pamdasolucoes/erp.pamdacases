import {test,expect} from '@playwright/test';
import {setup} from './support/mockErp';
import {uuid} from '../fixtures/customerRows';

test('relatórios abrem histórico, corrigem pagamento, reimprimem e cancelam sem alterar os produtos',async({page})=>{
 const {employee}=await setup(page,'admin_gerencial',{stayOnDashboard:true});
 const sale={id:uuid(77001),customer_id:uuid(1),order_number:10009,status:'confirmed',is_test:false,updated_at:'2026-10-26T12:00:00Z',confirmed_at:'2026-10-26T12:00:00Z',created_at:'2026-10-26T12:00:00Z',customer_snapshot:{code:'350',name:'Cristalcel QA'},branch_snapshot:{name:'Matriz',address:'Rua QA',number:'1',city:'Curitiba'},seller_snapshot:'Operador QA',subtotal:25,discount_amount:0,shipping_charged:5,total:30,notes:'Conferir modelo'};
 const item={id:uuid(77002),product_code_snapshot:'KIT-QA',product_sku_snapshot:'SKU-QA',description_snapshot:'Capa personalizada QA',quantity:1,negotiated_unit_price:25,line_subtotal:25,customization:{model:'Samsung A26',color:'Transparente'}};
 const payment={id:uuid(77003),method_code:'dinheiro',method_name:'Dinheiro',amount:30,status:'paid',channel:'erp'};
 const events:any[]=[];const writes:any[]=[];
 await page.route('**/rest/v1/rpc/pamda_operation_read',r=>r.fulfill({json:{rows:sale.status==='confirmed'?[{...sale,customer_name:'Cristalcel QA'}]:[],expenses:0}}));
 await page.route('**/rest/v1/rpc/pamda_customer_sale_history',r=>r.fulfill({json:[{id:sale.id,order_number:10009,date:sale.confirmed_at,status:sale.status,total:30}]}));
 await page.route('**/rest/v1/rpc/pamda_sale_movement_read',r=>r.fulfill({json:{sale,items:[item],payments:[payment],methods:[{code:'dinheiro',name:'Dinheiro'},{code:'pix',name:'Pix'}],events,can_maintain:true}}));
 await page.route('**/rest/v1/rpc/pamda_sale_movement_write',r=>{
  const b=r.request().postDataJSON();writes.push(b);expect(b.p_sale_id).toBe(sale.id);expect(b.p_request_key).toMatch(/^[0-9a-f-]{36}$/);
  if(b.p_action==='payments'){expect(b.p_payments).toEqual([{id:payment.id,method_code:'pix'}]);payment.method_code='pix';payment.method_name='Pix';}
  else{sale.status='cancelled';payment.status='void';}
  events.push({id:uuid(77010+writes.length),type:b.p_action==='payments'?'sale_payment_corrected':'confirmed_sale_cancelled',at:sale.updated_at,actor:'Admin QA',details:{reason:b.p_reason}});
  return r.fulfill({json:sale.id});
 });
 await page.route('**/rest/v1/rpc/pamda_real_sale_document',r=>r.fulfill({json:{receipt_number:'10009',issued_at:sale.confirmed_at,paid:30,payments:[payment],receipt_snapshot:{company:{company_name:'PAMDA CASES'}}}}));
 await page.getByRole('button',{name:'Vendas por Cliente',exact:true}).click();
 await page.getByRole('button',{name:'Cristalcel QA',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Histórico do cliente'})).toBeVisible();
 await page.getByRole('button',{name:'Pedido 10009',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Consultar pedido'})).toContainText('Samsung A26');
 await page.getByRole('button',{name:'Fechar consulta',exact:true}).click();await page.getByRole('button',{name:'Fechar histórico'}).click();
 await page.getByRole('button',{name:'Relatório de Vendas',exact:true}).click();
 await page.getByRole('button',{name:'Pedido 10009',exact:true}).click();
 await page.getByRole('button',{name:'Manutenção de movimento',exact:true}).click();
 await page.getByLabel('Forma do pagamento 1').selectOption('pix');await page.getByLabel('Motivo da manutenção').fill('Correção: recebeu por Pix');
 await page.getByRole('button',{name:'Salvar forma de pagamento',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Consultar pedido'}).getByRole('status')).toHaveText('Forma de pagamento atualizada.');
 await page.getByRole('button',{name:'Ver / reimprimir recibo',exact:true}).click();
 await expect(page.getByRole('article',{name:'Documento do recibo'})).toContainText('Pix: R$ 30,00');
 await page.getByRole('button',{name:'Fechar recibo',exact:true}).click();
 await page.getByRole('button',{name:'Cancelar venda fechada',exact:true}).click();
 await page.getByLabel('Motivo da manutenção').fill('Cancelamento solicitado pela direção');
 await page.getByRole('button',{name:'Confirmar cancelamento',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Consultar pedido'}).getByRole('status')).toHaveText('Venda cancelada. O estoque foi mantido.');
 expect(writes).toHaveLength(2);expect(payment.amount).toBe(30);expect(item.quantity).toBe(1);expect(employee.id).toBeTruthy();
 await page.getByRole('button',{name:'Fechar consulta',exact:true}).click();await expect(page.getByText('Nenhum registro encontrado.',{exact:true})).toBeVisible();
});
