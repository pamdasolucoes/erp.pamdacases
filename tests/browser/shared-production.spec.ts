import {test,expect} from '@playwright/test';
import {setup} from './support/mockErp';
test('ERP usa etapas compartilhadas de B2B e marketplace com responsável e motivo de erro',async({page})=>{
 await setup(page,'admin_gerencial',{stayOnDashboard:true});const calls:any[]=[];
 const rows=[{id:'task-a',source:'erp',stage:'queued',model:'Samsung A07',product_name:'Capa personalizada',case_source:'pamda',customer_name:'Loja B2B',external_order:'',order_number:10020,channel_name:null,quantity:1,stock_consumed:true,updated_at:'2026-10-30T12:00:00Z',images:[],events:[]},{id:'task-b',source:'messenger',stage:'queued',model:'Moto G56',product_name:'Capa personalizada',case_source:'pamda',customer_name:'Comprador Shopee',external_order:'261030ABC',order_number:null,channel_name:'Shopee Panda',quantity:1,stock_consumed:false,updated_at:'2026-10-30T12:00:00Z',images:[],events:[]} ] as any[];
 await page.route('**/rest/v1/rpc/pamda_shared_production_read',r=>r.fulfill({json:{rows,can_manage:true}}));
 await page.route('**/rest/v1/rpc/pamda_shared_production_action',async r=>{const body=r.request().postDataJSON();calls.push(body);const row=rows.find(t=>t.id===body.p_task)!;if(body.p_action==='error')row.events.push({action:'error',reason:body.p_reason,actor:'Pâmela',created_at:row.updated_at});else row.stage=body.p_action;row.separated_name='Pâmela';row.stock_consumed=true;return r.fulfill({json:row});});
 await page.getByRole('button',{name:'Fila de Produção',exact:true}).click();await expect(page.getByRole('heading',{name:'Fila de produção',exact:true})).toBeVisible();await expect(page.getByRole('article')).toHaveCount(2);
 await page.getByLabel('Pesquisar produção').fill('261030ABC');await expect(page.getByRole('article')).toHaveCount(1);
 await page.getByRole('button',{name:'Separar capa',exact:true}).click();await expect(page.getByText('Separou: Pâmela')).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Confirmar impressão',exact:true}).click();await expect(page.getByRole('button',{name:'Confirmar conferência'})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept('Erro da impressora: falha no alinhamento'));await page.getByRole('button',{name:'Sinalizar erro'}).click();await page.getByRole('button',{name:/Histórico e motivos/}).click();await expect(page.getByText(/Erro da impressora: falha no alinhamento/)).toBeVisible();
 expect(calls.map(c=>c.p_action)).toEqual(['separated','printed','error']);expect(calls.every(c=>typeof c.p_request_key==='string')).toBeTruthy();
});
test('consulta de produção não oferece ações quando o servidor nega gerenciamento',async({page})=>{
 await setup(page,'producao',{stayOnDashboard:true});await page.route('**/rest/v1/rpc/pamda_shared_production_read',r=>r.fulfill({json:{rows:[{id:'task',source:'erp',stage:'queued',model:'A07',product_name:'Capa',case_source:'pamda',customer_name:'Loja',quantity:1,stock_consumed:true,updated_at:'2026-10-30',images:[],events:[]}],can_manage:false}}));
 await page.getByRole('button',{name:'Fila de Produção',exact:true}).click();await expect(page.getByRole('article')).toHaveCount(1);await expect(page.getByRole('button',{name:'Separar capa'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Cancelar produção'})).toHaveCount(0);
});
test('capa sem personalização segue da separação para conferência sem marcar impressão',async({page})=>{
 await setup(page,'admin_gerencial',{stayOnDashboard:true});const calls:any[]=[];const row={id:'plain',source:'erp',stage:'separated',requires_print:false,model:'A07',product_name:'Capa transparente',case_source:'pamda',customer_name:'Loja',quantity:1,stock_consumed:true,updated_at:'2026-10-30',images:[],events:[]};
 await page.route('**/rest/v1/rpc/pamda_shared_production_read',r=>r.fulfill({json:{rows:[row],can_manage:true}}));await page.route('**/rest/v1/rpc/pamda_shared_production_action',r=>{calls.push(r.request().postDataJSON());row.stage='inspected';return r.fulfill({json:row});});
 await page.getByRole('button',{name:'Fila de Produção',exact:true}).click();await expect(page.getByRole('button',{name:'Confirmar impressão'})).toHaveCount(0);await page.getByRole('button',{name:'Confirmar conferência'}).click();await expect(page.getByRole('button',{name:'Confirmar embalagem'})).toBeVisible();expect(calls[0].p_action).toBe('inspected');
});
