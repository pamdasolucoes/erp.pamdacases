import {test,expect} from '@playwright/test';
import {setup,selectCatalogProduct} from './support/mockErp';
import {kitId} from '../fixtures/officialProducts';

test('passar pelo menu adianta apenas o código da tela, sem ler o catálogo',async({page})=>{
  const {state}=await setup(page,'admin_gerencial',{stayOnDashboard:true});
  const loaded=page.waitForResponse(response=>new URL(response.url()).pathname==='/src/views/products/ProductsView.tsx');
  await page.getByRole('complementary').getByRole('button',{name:'Produtos & Serviços',exact:true}).hover();
  await loaded;
  expect(state.productReads).toBe(0);expect(state.reads).toBe(0);
  await page.getByRole('complementary').getByRole('button',{name:'Produtos & Serviços',exact:true}).click();
  await expect(page.getByText(/637 itens oficiais/)).toBeVisible();
  expect(state.productReads).toBeGreaterThan(0);expect(state.pageErrors).toEqual([]);
});

test('feedback global cobre ícones, links, teclado e novos controles sem alterar ações',async({page})=>{
  const {state}=await setup(page);
  const result=await page.evaluate(()=>{
    const host=document.createElement('div');
    host.innerHTML='<button id="pulse"><span>Ícone</span></button><a href="#" id="link">Pedido</a><button disabled id="disabled">Bloqueado</button><input id="text">';
    document.body.append(host);
    const pointer=(selector:string)=>{
      const target=host.querySelector(selector)!;
      target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,isPrimary:true}));
      return target.closest('button,a,input')!.getAnimations().length;
    };
    const values=[pointer('#pulse span'),pointer('#link'),pointer('#disabled'),pointer('#text')];
    host.querySelector('#pulse')!.getAnimations().forEach(a=>a.cancel());
    host.querySelector('#pulse')!.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter'}));
    const keyboard=host.querySelector('#pulse')!.getAnimations().length;
    host.remove();return {values,keyboard};
  });
  expect(result).toEqual({values:[1,1,0,0],keyboard:1});
  expect(state.pageErrors).toEqual([]);
});

test('preferência de movimento reduzido é respeitada',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await setup(page);
  expect(await page.evaluate(()=>{
    const button=document.querySelector('button')!;
    button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,isPrimary:true}));
    return button.getAnimations().length;
  })).toBe(0);
});

test('abrir outro pedido sinaliza a espera, lê detalhes uma vez e preserva o salvamento',async({page})=>{
  const {sales,state}=await setup(page);
  for(let i=0;i<2;i++){
    if(i)await page.getByRole('button',{name:'Clientes e Unidades',exact:true}).click();
    await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
    await selectCatalogProduct(page,kitId(1));
    await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
    await page.getByRole('button',{name:'Pendências',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Todas as Vendas',level:1})).toBeVisible();
  }
  const reads:string[]=[];
  await page.route('https://pamda-test.invalid/rest/v1/**',async route=>{
    if(new URL(route.request().url()).pathname==='/rest/v1/erp_sales'){
      reads.push(route.request().url());await new Promise(resolve=>setTimeout(resolve,100));
    }
    await route.fallback();
  });
  const writes=sales.writes.length;
  await page.getByRole('button',{name:'Pedido 10000',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Abrindo pedido 10000'})).toBeVisible();
  await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
  expect(reads.filter(url=>new URL(url).searchParams.get('select')?.includes('draft_key'))).toHaveLength(1);
  expect(sales.writes).toHaveLength(writes);
  expect(sales.sales).toHaveLength(2);expect(state.pageErrors).toEqual([]);
});
