import { expect, test } from '@playwright/test';
import { setup } from './support/mockErp';
import { uuid } from '../fixtures/customerRows';

test('rede selecionada explicitamente, dados financeiros protegidos e fechamento real', async ({page}) => {
  test.setTimeout(60000);
  const {state}=await setup(page);
  state.financialPermission=true;
  const network = { id:uuid(800), network_name:'Rede manual',network_code:'REDE',network_kind:'rede',headquarters_customer_id:uuid(1),default_cycle:'flexivel',default_collection_mode:'flexivel',default_due_days:null,notes:null };
  const members = [1,2].map((n,i)=>({id:uuid(810+n),network_id:network.id,customer_id:uuid(n),unit_sequence:i,display_code:i?'REDE-1':'REDE',legacy_customer_code:'00000'+n}));
  const networkWrites: any[]=[];let financialAuthorized=false;const closings:any[]=[];
  await page.route('**/rest/v1/rpc/pamda_network_closing',route=>{closings.push(route.request().postDataJSON());return route.fulfill({json:{confirmed:true,count:1}});});
  await page.route('**/rest/v1/erp_customer_network*',route=>{
    const rows=route.request().url().includes('erp_customer_network_members')?members:[network];
    return route.fulfill({json:rows,headers:{'content-range':'0-'+(rows.length-1)+'/'+rows.length,'access-control-expose-headers':'content-range'}});
  });
  await page.route('**/rest/v1/rpc/pamda_is_admin',route=>route.fulfill({json:true}));
  await page.route('**/rest/v1/rpc/pamda_admin_configurar_cobranca_rede',route=>{
    const p=route.request().postDataJSON();networkWrites.push(p);
    Object.assign(network,{default_cycle:p.p_ciclo,default_collection_mode:p.p_modo,default_due_days:p.p_dias,notes:p.p_observacoes});
    return route.fulfill({json:null});
  });
  await page.route('**/rest/v1/rpc/pamda_relatorio_rede_clientes',route=>{
    const p=route.request().postDataJSON();
    return route.fulfill({json:{network_id:network.id,from:p.p_inicio,to:p.p_fim,financial_authorized:financialAuthorized,payments_integrated:true,units:[1,2].map(n=>({
      customer_id:uuid(n),branch_id:uuid(1000+n),customer_name:'Loja '+n,branch_name:'Unidade '+n,legacy_customer_code:'00000'+n,group_display_code:n===1?'REDE':'REDE-1',
      billing_cycle:'flexivel',collection_mode:'flexivel',due_days:null,orders_started:1,orders_confirmed_real:1,orders_confirmed_test:0,orders_cancelled:0,purchases_real:999,purchases_test:10,paid_real:5,paid_test:null,payments_integrated:true,
    }))}});
  });
  await page.reload();
  await page.getByRole('navigation').getByRole('button',{name:'Rede de Lojas',exact:true}).click();
  const panel=page.getByRole('region',{name:'Rede de lojas',exact:true});
  await panel.getByLabel('Selecionar rede').selectOption(network.id);
  await expect(panel.getByText('Histórico original:',{exact:false}).first()).toBeVisible();
  await panel.getByRole('combobox',{name:'Configurar',exact:true}).selectOption('rede:'+network.id);
  await panel.getByRole('combobox',{name:'Proposta comercial (apenas preenche o formulário)',exact:true}).selectOption('Cristal Cell');
  expect(networkWrites).toHaveLength(0);
  await expect(panel.getByRole('button',{name:'Salvar preferências'})).toBeDisabled();
  await panel.getByRole('checkbox',{name:/Revisei o destino/}).check();
  await panel.getByRole('button',{name:'Salvar preferências'}).click();
  await expect(panel.getByText('Preferências confirmadas pelo servidor.')).toBeVisible();
  expect(networkWrites).toHaveLength(1);expect(networkWrites[0].p_ciclo).toBe('mensal');
  await panel.getByLabel('Início',{exact:true}).fill('2026-10-01');
  await panel.getByLabel('Fim',{exact:true}).fill('2026-10-20');
  await panel.getByRole('button',{name:'Consultar relatório'}).click();
  await expect(panel.getByText('Acesso financeiro restrito').first()).toBeVisible();
  await expect(panel.getByRole('table').locator('tbody tr')).toHaveCount(2);
  await panel.getByRole('combobox',{name:'Loja',exact:true}).selectOption(uuid(2));
  await expect(panel.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await panel.getByRole('combobox',{name:'Modo de fechamento',exact:true}).selectOption('consolidado');
  await expect(panel.getByRole('button',{name:/Gerar documento consolidado/})).toBeDisabled();
  financialAuthorized=true;await panel.getByRole('button',{name:'Consultar relatório'}).click();
  await expect(panel.getByRole('button',{name:'Gerar documento consolidado',exact:true})).toBeEnabled();
  await panel.getByRole('button',{name:'Gerar documento consolidado',exact:true}).click();
  await expect(panel.getByText(/Fechamento gerado/)).toBeVisible();expect(closings).toHaveLength(1);expect(closings[0].p_mode).toBe('consolidado');expect(closings[0].p_customer_id).toBe(uuid(2));
  await expect(panel.getByRole('columnheader',{name:'Confirmados teste',exact:true})).toHaveCount(0);
  expect(state.writes).toEqual([]);expect(state.pageErrors).toEqual([]);
});
