import {test,expect} from '@playwright/test';
import {setup} from './support/mockErp';

test('módulos reais exibem consultas, ajuste de estoque e entradas sem fornecedor obrigatório',async({page})=>{
 await setup(page,'admin_gerencial',{stayOnDashboard:true});
 const writes:any[]=[];
 await page.route('**/rest/v1/rpc/pamda_operation_read',async route=>{
  const module=route.request().postDataJSON().p_module;
  const empty={rows:[],products:[{id:'00000000-0000-4000-8000-000000000001',code:'101',name:'Capa',balance:8,verified:true,min:1,cost:2}],movements:[],suppliers:[],entries:[],customers:[],methods:[],expenses:0};
  return route.fulfill({json:module==='settings'?{company_name:'Pamda',phone:'',cnpj:'',pix_key:'',production_after_payment:false}:empty});
 });
 await page.route('**/rest/v1/rpc/pamda_stock_write',async route=>{writes.push(route.request().postDataJSON());return route.fulfill({json:'00000000-0000-4000-8000-000000000002'});});
 await page.getByRole('button',{name:'Estoque & Movimentos',exact:true}).click();
 await page.getByRole('combobox',{name:'Produto',exact:true}).selectOption('00000000-0000-4000-8000-000000000001');
 await page.getByLabel('Quantidade contada (novo saldo)').fill('12');await page.getByLabel('Motivo do ajuste').fill('Contagem física');
 await page.getByRole('button',{name:'Registrar ajuste',exact:true}).click();
 await expect(page.getByText('Operação confirmada no Supabase.')).toBeVisible();
 expect(writes[0].p_data.items[0].counted).toBe(12);expect(writes[0].p_data.kind).toBe('adjustment');
 await page.getByRole('button',{name:'Compras & Entradas',exact:true}).click();await expect(page.getByLabel('Fornecedor (opcional)')).toBeVisible();
 for(const [button,heading] of [['Contas a Receber','Contas a receber'],['Fechamentos','Fechamentos'],['Fretes & Entregas','Fretes e entregas'],['Despesas','Despesas'],['Fila de Produção','Fila de produção'],['Relatório de Vendas','Relatório de vendas'],['Vendas por Cliente','Vendas por cliente'],['Lucratividade Real','Lucratividade'],['Auditoria & Logs','Auditoria e logs'],['Configurações','Configurações']]){
  await page.getByRole('button',{name:button,exact:true}).first().click();await expect(page.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible();
  await expect(page.getByText('Consultando Supabase…')).toHaveCount(0);
 }
 await page.screenshot({path:'test-results/operations-settings.png',fullPage:true});
});

test('permissão negada oculta módulos e falha de consulta não exibe sucesso',async({page})=>{
 await setup(page,'producao',{stayOnDashboard:true});
 await expect(page.getByRole('button',{name:'Usuários & Acessos',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Contas a Receber',exact:true})).toHaveCount(0);
 await page.route('**/rest/v1/rpc/pamda_operation_read',route=>route.fulfill({status:403,json:{code:'42501',message:'Negado'}}));
 await page.getByRole('button',{name:'Fila de Produção',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('permissão');
 await expect(page.getByText('Operação confirmada no Supabase.')).toHaveCount(0);
});
