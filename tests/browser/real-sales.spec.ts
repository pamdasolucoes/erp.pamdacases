import {test,expect} from '@playwright/test';
import {setup,selectCatalogProduct} from './support/mockErp';
import {kitId} from '../fixtures/officialProducts';

test('finalização real preserva divisão dos pagamentos, confirma no servidor e mostra recibo sem marca de teste',async({page})=>{
 const {sales}=await setup(page);const calls:any[]=[];
 await page.route('**/rest/v1/rpc/pamda_finalize_sale',async route=>{
  const body=route.request().postDataJSON();calls.push(body);const sale=sales.sales.find(s=>s.id===body.p_sale_id)!;
  sale.status='confirmed';sale.is_test=false;sale.confirmed_at=new Date().toISOString();
  return route.fulfill({json:{sale_id:sale.id,status:'confirmed'}});
 });
 await page.route('**/rest/v1/rpc/pamda_real_sale_document',async route=>{
  const sale=sales.sales.find(s=>s.id===route.request().postDataJSON().p_sale_id)!;
  return route.fulfill({json:{receipt_number:String(sale.order_number),issued_at:new Date().toISOString(),paid:0,receipt_snapshot:{company:{company_name:'PAMDA CASES',cnpj:'',phone:'',pix_key:''}}}});
 });
 await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
 await selectCatalogProduct(page,kitId(1));
 const paymentSection=page.getByRole('region',{name:'Pagamento da venda'});
 await paymentSection.getByLabel('Forma de pagamento da venda',{exact:true}).selectOption({index:1});
 await paymentSection.getByLabel('Valor da forma de pagamento 1').fill('10,00');
 await paymentSection.getByRole('button',{name:'+ Adicionar forma de pagamento'}).click();
 await paymentSection.getByLabel('Valor da forma de pagamento 2').fill('15,00');
 await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('');
 await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
 await page.getByRole('button',{name:'Finalizar venda',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Finalizar venda',exact:true});
 await expect(modal.getByRole('spinbutton')).toHaveCount(2);
 await expect(modal.getByLabel('Situação',{exact:true})).toHaveCount(0);
 await expect(modal.getByLabel('Comprovante / referência',{exact:true})).toHaveCount(0);
 await modal.getByRole('button',{name:'Confirmar venda',exact:true}).click();
 await expect(page.getByText('Venda finalizada com sucesso',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Todas as Vendas'})).toBeVisible();
 expect(calls).toHaveLength(1);expect(calls[0].p_payments.map((p:any)=>p.amount)).toEqual([10,15]);
 expect(calls[0].p_payments.every((p:any)=>p.channel==='erp'&&p.status==='paid'&&p.reference===undefined&&p.scheduled_for===undefined)).toBe(true);
 await expect(page.getByText('DOCUMENTO DE TESTE - SEM VALOR FISCAL',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('article',{name:'Documento do recibo'})).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Finalizar venda',exact:true})).toHaveCount(0);
});

test('cadastro e configuração de opções por usuário ficam no ERP',async({page})=>{
 await setup(page,'admin_gerencial',{stayOnDashboard:true});const writes:any[]=[];
 const employee={user_id:'00000000-0000-4000-8000-000000000010',username:'new@example.invalid',display_name:'Funcionário novo',role:'producao',active:true,can_view_financial_metrics:false};
 const data={users:[] as any[],catalog:[{key:'module.estoque',description:'Menu: Estoque e movimentos'},{key:'stock.read',description:'Consultar estoque'}],roles:[],overrides:[]};
 await page.route('**/rest/v1/rpc/pamda_users_read',r=>r.fulfill({json:data}));
 await page.route('**/functions/v1/pamda-user-admin',async r=>{writes.push(r.request().postDataJSON());data.users.push(employee);return r.fulfill({json:{user_id:employee.user_id}});});
 await page.route('**/rest/v1/rpc/pamda_user_save',async r=>{writes.push(r.request().postDataJSON());return r.fulfill({json:null});});
 await page.getByRole('button',{name:'Usuários & Acessos',exact:true}).click();
 await page.getByLabel('Nome',{exact:true}).fill(employee.display_name);await page.getByLabel('E-mail de acesso').fill(employee.username);await page.getByLabel('Senha inicial (mínimo 12 caracteres)').fill('synthetic-password-only');
 await page.getByRole('combobox',{name:'Perfil',exact:true}).selectOption('producao');
 await page.getByRole('button',{name:'Cadastrar usuário',exact:true}).click();
 await page.getByRole('button',{name:/Funcionário novo/}).click();
 await page.getByLabel('Menu: Estoque e movimentos').check();await page.getByLabel('Consultar estoque').check();
 await page.getByRole('button',{name:'Salvar acessos',exact:true}).click();
 await expect(page.getByText('Perfil e permissões salvos no Supabase.')).toBeVisible();
 expect(writes[0].action).toBe('create');expect(writes[1].p_data.permissions).toEqual({'module.estoque':true,'stock.read':true});
});
