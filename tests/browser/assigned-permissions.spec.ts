import {test,expect} from '@playwright/test';
import {setup} from './support/mockErp';
import {changePermission} from '../../src/services/permissions';

test('gerencial autorizado cadastra cliente, edita filial e acessa condições de pagamento',async({page})=>{
 const permissions=changePermission({},'customers.manage',true);
 const ctx=await setup(page,'gerencial',{stayOnDashboard:true,permissions});
 await page.getByRole('button',{name:'Clientes e Unidades',exact:true}).first().click();
 await page.getByRole('button',{name:'Novo cliente',exact:true}).click();
 const form=page.getByRole('form',{name:'Novo cliente e matriz'});
 await expect(form.getByLabel('Código comercial',{exact:true})).toHaveValue('2339');
 await form.getByLabel('Nome do cliente',{exact:true}).fill('Cliente permissão delegada');
 await form.getByLabel('Endereço',{exact:true}).fill('Rua de teste');
 await form.getByRole('button',{name:'Salvar cadastro',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Cliente permissão delegada',exact:true,level:2})).toBeVisible();
 await expect(page.getByRole('button',{name:'+ Adicionar filial',exact:true}).first()).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Forma padrão do cliente',exact:true})).toBeEnabled();
 expect(ctx.admin.writes).toHaveLength(1);expect(ctx.state.pageErrors).toEqual([]);
});

test('sessão aberta atualiza concessão e revogação no foco, sem novo login',async({page})=>{
 const permissions:Record<string,boolean>={'sales.read':true,'module.produtos':true,'products.manage':false};
 const ctx=await setup(page,'gerencial',{stayOnDashboard:true,permissions});
 await page.getByRole('button',{name:'Produtos & Serviços',exact:true}).click();
 await expect(page.getByRole('button',{name:'Novo Produto',exact:true})).toBeDisabled();
 permissions['products.manage']=true;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('button',{name:'Novo Produto',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Novo Produto',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Novo Produto',exact:true})).toBeVisible();
 permissions['products.manage']=false;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('heading',{name:'Novo Produto',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Novo Produto',exact:true})).toBeDisabled();
 expect(ctx.state.tokenRequests).toBe(1);expect(ctx.state.pageErrors).toEqual([]);
});

test('gerencial com users.manage abre a matriz e marca requisitos sem liberar escrita de outros módulos',async({page})=>{
 const permissions=changePermission({},'users.manage',true);
 const ctx=await setup(page,'gerencial',{stayOnDashboard:true,permissions});
 await page.route('**/rest/v1/rpc/pamda_users_read',route=>route.fulfill({json:{users:[{user_id:'00000000-0000-4000-8000-000000000099',username:'teste',display_name:'Funcionário isolado',role:'producao',active:true,can_view_financial_metrics:false}],catalog:[{key:'sales.confirm',description:'Confirmar vendas reais'},{key:'sales.draft',description:'Preparar pedidos'},{key:'sales.read',description:'Consultar vendas'},{key:'module.nova_venda',description:'Menu: Nova venda'},{key:'module.vendas',description:'Menu: Vendas'},{key:'finance.manage',description:'Gerenciar lançamentos financeiros'}],roles:[],overrides:[]}}));
 await page.getByRole('button',{name:'Usuários & Acessos',exact:true}).click();
 await page.getByRole('button',{name:/Funcionário isolado/}).click();
 await page.getByRole('checkbox',{name:'Confirmar vendas reais',exact:true}).check();
 for(const label of ['Preparar pedidos','Consultar vendas','Menu: Nova venda','Menu: Vendas'])await expect(page.getByRole('checkbox',{name:label,exact:true})).toBeChecked();
 await expect(page.getByRole('checkbox',{name:'Gerenciar lançamentos financeiros',exact:true})).not.toBeChecked();
 expect(ctx.state.pageErrors).toEqual([]);
});
