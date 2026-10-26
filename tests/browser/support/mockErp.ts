import { expect, test, type Page } from '@playwright/test';
import { customerRow, branchRow, uuid } from '../../fixtures/customerRows';
import { officialCatalogFixture } from '../../fixtures/officialProducts';
import { MockSales } from './mockSales';
import { CoreAdminBackend } from '../../fixtures/coreAdminBackend';

export async function selectCatalogProduct(page: Page, id: string) {
  const product=officialCatalogFixture().products.find(row=>row.id===id)!;
  await page.getByRole('combobox',{name:'Adicionar produto do catálogo oficial',exact:true}).fill(product.code);
  await page.getByRole('listbox').getByRole('option').click();
}

// API inteiramente sintetica e interceptada. Nenhuma chamada ao projeto real.
export async function setup(page: Page, role: 'admin_gerencial' | 'venda_atendimento' | 'producao' | 'financeiro' | 'estoque_expedicao' = 'admin_gerencial', options:{reuseSession?:boolean;strictMode?:boolean;stayOnDashboard?:boolean;customerListOnly?:boolean;dataDelayMs?:number}={}) {
  const customers = Array.from({ length:384 }, (_,index) => customerRow(index + 1));
  customers[0] = customerRow(1,{ name:'Loja Árvore',company_name:'Comércio Teste',cpf:'123.456.789-01',notes:'  legado  ' });
  customers[349]=customerRow(350,{customer_code:'350',name:'Cristal Centro'});
  customers[350]=customerRow(351,{customer_code:'351',name:'Cristal Norte'});
  customers[1].company_name='Loja que menciona 350'; customers[1].cnpj='35000000000100';
  const branches = Array.from({ length:384 }, (_,index) => branchRow(index + 1));
  const {products,components}=officialCatalogFixture();
  const state = { listError:'', editError:'', productError:'', profileError:'', profileActive:true, identityRevoked:false, tokenRequests:0, refreshRequests:0, authLifetimeSeconds:3600, serverClockSeconds:0, emptyCatalog:false, coreError:'', customerShipping:{} as Record<string,number|null>, branchShipping:{} as Record<string,number|null>, financialPermission:false, authorizationError:'', authorizationDelay:0, writes:[] as { url:string;body:any }[], reads:0, productReads:0, pageErrors:[] as string[] };
  page.on('pageerror',error=>state.pageErrors.push(error.message));
  const employee = { id:uuid(9000),aud:'authenticated',role:'authenticated',email:'ui-test@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z' };
  const expires=()=>Math.floor(Date.now()/1000)+state.serverClockSeconds+state.authLifetimeSeconds;
  const token = ()=>`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:employee.id,aud:'authenticated',role:'authenticated',exp:expires()})).toString('base64url')}.test`;
  const sales=new MockSales(()=>({id:employee.id,active:state.profileActive,role}),customers,branches,products);
  const admin = new CoreAdminBackend(customers, branches, () => role === 'admin_gerencial' && state.profileActive);
  await page.route('**/*', async route => {
    const request=route.request(); const url=new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4317') {
      if(url.pathname==='/'&&options.strictMode){
        const response=await route.fetch();
        return route.fulfill({response,body:(await response.text()).replace('/src/main.tsx','/tests/browser/strict-harness.tsx')});
      }
      return route.continue();
    }
    if (url.origin === 'https://images.pamda-test.invalid') return route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});
    if (url.origin !== 'https://pamda-test.invalid') return route.abort();
    if (options.dataDelayMs && /^\/rest\/v1\/(customers|customer_branches|erp_product_catalog|kit_components)$/.test(url.pathname)) await new Promise(resolve => setTimeout(resolve, options.dataDelayMs));
    const respond=(body:unknown,status=200,headers:Record<string,string>={}) => route.fulfill({ status,contentType:'application/json',headers:{ 'access-control-allow-origin':'*', 'access-control-expose-headers':'content-range', ...headers },body:JSON.stringify(body) });
    if (url.pathname==='/auth/v1/token') {state.tokenRequests++;if(url.searchParams.get('grant_type')==='refresh_token') state.refreshRequests++;return respond({ access_token:token(),token_type:'bearer',expires_in:state.authLifetimeSeconds,expires_at:expires(),refresh_token:'synthetic-refresh-token',user:employee });}
    if (url.pathname==='/auth/v1/logout') return respond({});
    if (url.pathname==='/auth/v1/user') return state.identityRevoked?respond({msg:'Invalid session',code:'session_not_found'},401):respond(employee);
    if(url.pathname==='/rest/v1/rpc/pamda_my_permissions') return respond({'sales.read':role==='admin_gerencial'||role==='venda_atendimento','sales.draft':role==='admin_gerencial'||role==='venda_atendimento','sales.confirm':role==='admin_gerencial'||role==='venda_atendimento','customers.manage':role==='admin_gerencial','finance.read':state.financialPermission,'stock.read':role==='admin_gerencial'||role==='estoque_expedicao'||role==='venda_atendimento','production.read':true,'production.manage':role==='admin_gerencial'||role==='producao'});
    if (url.pathname==='/rest/v1/erp_user_profiles') {
      if(state.profileError==='network') return route.abort('failed');
      if(state.profileError) return respond({code:state.profileError,message:'Profile denied'},403);
      return respond([{ user_id:employee.id,username:'Teste isolado',role,active:state.profileActive,can_view_financial_metrics:state.financialPermission }]);
    }
    if (url.pathname==='/rest/v1/rpc/pamda_resumo_erp') {
      if(state.coreError)return respond({code:state.coreError,message:'Resumo indisponível'},403);
      return respond({as_of:'2026-10-19T12:00:00Z',pending_sales:sales.sales.filter(s=>s.status==='draft').length,pending_with_product_history:sales.sales.filter(s=>s.status==='draft'&&s.first_product_at!==null).length,pending_never_with_product:sales.sales.filter(s=>s.status==='draft'&&s.first_product_at===null).length,confirmed_sales:sales.sales.filter(s=>s.status==='confirmed'&&s.is_test!==true).length,test_confirmed_sales:sales.sales.filter(s=>s.status==='confirmed'&&s.is_test===true).length,cancelled_sales:sales.sales.filter(s=>s.status==='cancelled').length,official_receipts:0,test_receipts:sales.testReceipts.length,catalog_active:637,physical_items:316,physical_stock_verified:0,production_queue_count:null,confirmed_revenue_today:state.financialPermission?123.45:null,confirmed_revenue_month:state.financialPermission?234.56:null,receivables_balance:null});
    }
    if (url.pathname === '/rest/v1/rpc/pamda_has_permission' && request.postDataJSON().p_permission === 'finance.read') return respond(state.financialPermission);
    const adminResult = admin.handle(url.pathname, url, ['POST','PUT','PATCH'].includes(request.method()) ? request.postDataJSON() : null);
    if (adminResult) { if (adminResult.abort) return route.abort('failed'); return respond(adminResult.body, adminResult.status || 200, adminResult.headers); }
    if (url.pathname==='/rest/v1/rpc/pamda_contexto_comercial_cliente') {
      const body=request.postDataJSON(), customer=customers.find(c=>c.id===body.p_customer_id), branch=branches.find(b=>b.id===body.p_branch_id&&b.customer_id===body.p_customer_id);
      if(!customer||!branch)return respond({code:'22023',message:'Contexto inválido'},400);
      const parent=state.customerShipping[customer.id]??null,override=state.branchShipping[branch.id]??null;
      const settings=admin.customerSettings[customer.id], unitSettings=admin.branchSettings[branch.id];
      return respond({customer_id:customer.id,branch_id:branch.id,is_primary:branch.is_primary??false,customer_default_shipping_fee:parent,branch_shipping_fee_override:override,effective_shipping_fee:override??parent,freight_source:override!==null?'branch':parent!==null?'customer':null,payment_method_id:unitSettings?.default_method_id??settings?.default_method_id??null,payment_term_id:unitSettings?.default_term_id??settings?.default_term_id??null,credit_limit:settings?.credit_limit??null,billing_mode:null});
    }
    if (['/rest/v1/rpc/pamda_salvar_frete_padrao','/rest/v1/rpc/pamda_salvar_frete_filial'].includes(url.pathname)) {
      const body=request.postDataJSON();
      if(role!=='admin_gerencial')return respond({code:'42501',message:'Sem permissão'},403);
      if(url.pathname.endsWith('pamda_salvar_frete_padrao')) { state.customerShipping[body.p_customer_id]=body.p_amount; Object.assign(customers.find(row=>row.id===body.p_customer_id)!,{default_shipping_fee:body.p_amount,updated_at:new Date().toISOString()}); }
      else { state.branchShipping[body.p_branch_id]=body.p_amount; Object.assign(branches.find(row=>row.id===body.p_branch_id)!,{shipping_fee_override:body.p_amount,updated_at:new Date().toISOString()}); }
      return respond(null);
    }
    if(url.pathname==='/rest/v1/rpc/pamda_sugerir_frete_endereco'){
      const body=request.postDataJSON(),city=String(body.p_city||'').trim().toLocaleLowerCase('pt-BR'),neighborhood=String(body.p_neighborhood||'').trim().toLocaleLowerCase('pt-BR');
      if(city==='curitiba')return respond(neighborhood==='centro'?0:5);
      if(['são josé dos pinhais','sao jose dos pinhais','pinhais','colombo','araucária','fazenda rio grande','campo largo'].includes(city))return respond(10);
      return respond(null);
    }
    if(url.pathname==='/rest/v1/erp_payment_methods'){
      const rows=[['pix','Pix'],['dinheiro','Dinheiro'],['cartao_debito','Cartão de débito'],['cartao_credito','Cartão de crédito'],['boleto','Boleto'],['credito_cliente','Crédito do cliente']].map(([code,name],index)=>({id:uuid(5500+index),code,name,active:true,created_at:'2026-01-01T00:00:00Z'}));
      return respond(rows,200,{'content-range':`0-${rows.length-1}/${rows.length}`});
    }
    if(url.pathname==='/rest/v1/erp_payment_terms')return respond([],200,{'content-range':'*/0'});
    if(['/rest/v1/erp_customer_payment_settings','/rest/v1/erp_branch_payment_settings'].includes(url.pathname))return respond([]);
    const saleResult=await sales.handle(url.pathname,url,['POST','PUT','PATCH'].includes(request.method())?request.postDataJSON():null);
    if(saleResult){if(saleResult.abort)return route.abort('failed');return respond(saleResult.body,saleResult.status||200,saleResult.headers);}
    if (url.pathname==='/rest/v1/erp_product_catalog' || url.pathname==='/rest/v1/kit_components') {
      expect(request.method()).toBe('GET'); state.productReads++;
      if (state.productError==='network') return route.abort('failed');
      if (state.productError) return respond({code:state.productError,message:'Leitura bloqueada'},403);
      const rows=state.emptyCatalog ? [] : url.pathname.endsWith('/erp_product_catalog') ? products : components;
      const from=Number(url.searchParams.get('offset') || 0), size=Math.min(37,Number(url.searchParams.get('limit') || 100));
      const pageRows=rows.slice(from,from+size);
      return respond(pageRows,200,{'content-range':`${from}-${from+pageRows.length-1}/${rows.length}`});
    }
    if (url.pathname==='/rest/v1/customers' || url.pathname==='/rest/v1/customer_branches') {
      expect(request.method()).toBe('GET'); state.reads++;
      if (state.listError==='network') return route.abort('failed');
      if (state.listError) return respond({ code:state.listError,message:'Acesso negado' },403);
      let rows: any[]=url.pathname.endsWith('/customers') ? customers : branches;
      for (const key of ['id','customer_id']) if (url.searchParams.has(key)) rows=rows.filter(row=>row[key]===url.searchParams.get(key)!.slice(3));
      const from=Number(url.searchParams.get('offset') || request.headers()['range']?.split('-')[0] || 0);
      const requested=Number(url.searchParams.get('limit') || 100);
      const pageRows=rows.slice(from,from+Math.min(37,requested));
      return respond(pageRows,200,{ 'content-range':`${from}-${from+pageRows.length-1}/${rows.length}` });
    }
    if (url.pathname==='/rest/v1/sales') return respond({ code:'PGRST205',message:'Table not available' },404);
    if (!['GET','OPTIONS'].includes(request.method())) state.writes.push({ url:url.pathname,body:request.postDataJSON() });
    if (url.pathname==='/rest/v1/rpc/pamda_authorize_demo_pricing') {
      if (state.authorizationDelay) await new Promise(resolve => setTimeout(resolve,state.authorizationDelay));
      if (state.authorizationError==='network') return route.abort('failed');
      if (role!=='admin_gerencial' || state.authorizationError) return respond({code:state.authorizationError || '42501',message:'Nao autorizado'},403);
      const payload=request.postDataJSON();
      return respond({scope:'demo_only',official_sale_allowed:false,revision:payload.p_draft.revision,
        authorized_at:'2026-10-15T12:00:00Z',authorized_by:{id:employee.id,username:'Teste isolado'}});
    }
    if (url.pathname==='/rest/v1/rpc/pamda_update_customer') {
      if (state.editError==='network') return route.abort('failed');
      if (state.editError) return respond({ code:state.editError,message:'Edicao bloqueada' },403);
      const payload=request.postDataJSON();
      const customer=customers.find(row=>row.id===payload.p_customer_id)!;
      expect(Object.keys(payload.p_changes)).not.toContain('customer_code');
      Object.assign(customer,payload.p_changes,{ updated_at:new Date().toISOString() });
      for (const edit of payload.p_branches) {
        const branch=branches.find(row=>row.id===edit.id && row.customer_id===customer.id)!;
        Object.assign(branch,edit.changes,{ updated_at:new Date().toISOString() });
      }
      return respond({ customer,branches:branches.filter(row=>row.customer_id===customer.id) });
    }
    return respond({ code:'UNEXPECTED_ENDPOINT' },500);
  });
  await page.goto('/');
  if(!options.reuseSession){
    await expect(page.getByRole('heading',{name:'Bem-vindo ao PAMDA ERP'})).toBeVisible();
    expect(state.reads).toBe(0);
    await page.getByLabel('E-mail',{ exact:true }).fill('ui-test@example.invalid');
    await page.locator('#login-password').fill('only-synthetic-test-password');
    await page.getByRole('button',{ name:'Entrar',exact:true }).click();
  }
  await expect(page.getByText('Dashboard Geral',{exact:true})).toBeVisible();
  if(!options.stayOnDashboard){
    if (role === 'admin_gerencial') {
      await page.getByRole('main').getByRole('button',{name:'Clientes e Unidades',exact:true}).click();
      await expect(page.getByText('384 clientes acessíveis')).toBeVisible();
      if(!options.customerListOnly)await page.getByTestId('customer-row-'+customers[0].id).click();
    } else {
      await expect(page.getByText('Teste isolado',{exact:true}).first()).toBeVisible();
    }
  }
  return { state,customers,branches,products,components,employee,sales,admin };
}
