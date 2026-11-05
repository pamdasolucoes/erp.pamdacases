import {test,expect} from '@playwright/test';
import {setup} from './support/mockErp';
test('novo cliente recebe código disponível e salva sem digitação do código',async({page})=>{
 const {admin}=await setup(page);
 await page.getByRole('button',{name:'Novo cliente',exact:true}).click();
 await expect(page.getByRole('form',{name:'Novo cliente e matriz'}).getByLabel('Código comercial',{exact:true})).toHaveValue('2339');
 await expect(page.getByRole('form',{name:'Novo cliente e matriz'}).getByLabel('Código comercial',{exact:true})).toHaveAttribute('readonly','');
 await page.getByLabel('Nome do cliente',{exact:true}).fill('Loja Nova QA');
 await page.getByLabel('Endereço',{exact:true}).fill('Rua QA');await page.getByLabel('Cidade',{exact:true}).fill('Curitiba');await page.getByLabel('Estado',{exact:true}).fill('PR');
 await page.getByRole('button',{name:'Salvar cadastro',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Loja Nova QA',exact:true,level:2})).toBeVisible();
 expect(admin.customers.find(c=>c.name==='Loja Nova QA')?.customer_code).toBe('2339');
});
test('log mostra responsável, venda e mudança de pagamento com nomes legíveis',async({page})=>{
 await setup(page,'admin_gerencial',{stayOnDashboard:true});
 await page.route('**/rest/v1/rpc/pamda_operation_read',route=>route.fulfill({json:{rows:[{id:'audit-1',action:'sale.maintenance.payments',actor_user_id:'00000000-0000-4000-8000-000000000001',actor_name:'Pâmela Atendimento',entity_label:'Venda nº 10009 · Cristalcel',happened_at:new Date().toISOString(),details:{before:{method_code:'cash'},after:{method_code:'pix'},reason:'Correção de recebimento'},reference_names:{}}]}}));
 await page.getByRole('button',{name:'Auditoria & Logs',exact:true}).click();
 await expect(page.getByRole('cell',{name:'Pâmela Atendimento',exact:true})).toBeVisible();
 await expect(page.getByRole('cell',{name:'Venda nº 10009 · Cristalcel',exact:true})).toBeVisible();
 await page.getByText('Ver o que foi alterado',{exact:true}).click();
 await expect(page.getByText('Dinheiro',{exact:true})).toBeVisible();await expect(page.getByText('Pix',{exact:true})).toBeVisible();
 await expect(page.getByText('Correção de recebimento',{exact:true})).toBeVisible();
});

test('cadastro inicial salva documentos e contatos opcionais e pula código ocupado',async({page})=>{
 const {admin,customers}=await setup(page);
 customers[0].customer_code='2339';customers[0].active=false;
 await page.getByRole('button',{name:'Novo cliente',exact:true}).click();
 const form=page.getByRole('form',{name:'Novo cliente e matriz'});
 await expect(form.getByLabel('Código comercial',{exact:true})).toHaveValue('2340');
 for(const label of ['CPF','CNPJ','E-mail','Telefone de contato'])await expect(form.getByLabel(label,{exact:true})).toHaveJSProperty('required',false);
 await form.getByLabel('Nome do cliente',{exact:true}).fill('Cliente com contatos QA');
 await form.getByLabel('CPF',{exact:true}).fill('000.000.000-00');
 await form.getByLabel('CNPJ',{exact:true}).fill('00.000.000/0000-00');
 await form.getByLabel('E-mail',{exact:true}).fill('loja@example.invalid');
 await form.getByLabel('Telefone de contato',{exact:true}).fill('(41) 99999-0000');
 await form.getByLabel('Endereço',{exact:true}).fill('Rua QA');await form.getByLabel('Cidade',{exact:true}).fill('Curitiba');await form.getByLabel('Estado',{exact:true}).fill('PR');
 await form.getByRole('button',{name:'Salvar cadastro',exact:true}).click();
 await expect(form).toHaveCount(0);
 const saved=admin.customers.find(c=>c.name==='Cliente com contatos QA')!;
 expect(saved.customer_code).toBe('2340');expect(saved.cpf).toBe('000.000.000-00');expect(saved.cnpj).toBe('00.000.000/0000-00');expect(saved.email).toBe('loja@example.invalid');expect(saved.phone).toBe('(41) 99999-0000');
});
