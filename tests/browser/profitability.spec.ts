import {test,expect} from '@playwright/test';
import {setup} from './support/mockErp';
test('lucratividade mostra custo gerencial, lucro e markup mesmo com frete pendente; pesquisa reflete os totais',async({page})=>{
 await setup(page,'admin_gerencial',{stayOnDashboard:true});
 await page.route('**/rest/v1/rpc/pamda_operation_read',r=>r.fulfill({json:{expenses:2,rows:[
 {id:'a',order_number:10005,confirmed_at:'2026-10-23T12:00:00Z',customer_name:'Cliente Alfa',subtotal:'25.00',discount_amount:'0.00',shipping_charged:'10.00',delivery_cost:null,product_cost:'5.00',cost_verified:true},
 {id:'b',order_number:10006,confirmed_at:'2026-10-23T12:00:00Z',customer_name:'Cliente Beta',subtotal:'80.00',discount_amount:'0.00',shipping_charged:'0.00',delivery_cost:0,product_cost:'5.00',cost_verified:true}
 ]}}));
 await page.getByRole('navigation').getByRole('button',{name:'Lucratividade Real',exact:true}).click();
 const report=page.getByRole('region',{name:'Análise de lucratividade'});
 await expect(report.getByRole('columnheader',{name:'Markup',exact:true})).toBeVisible();
 await expect(report.getByText('950,00%',{exact:true})).toBeVisible();
 await expect(report.getByText('R$ 95,00',{exact:true})).toBeVisible();
 await expect(report.getByText(/Há custos de entrega não informados/)).toBeVisible();
 await expect(report.getByText('Taxa Marketplace')).toHaveCount(0);
 await page.screenshot({path:'test-results/profitability-desktop.png',fullPage:true});
 await page.getByLabel('Pesquisar',{exact:true}).fill('Alfa');
 await expect(report.getByText('400,00%',{exact:true})).toHaveCount(2);
 await expect(report.getByText('Cliente Beta',{exact:true})).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.locator('aside').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
 await page.screenshot({path:'test-results/profitability-mobile.png',fullPage:true});
});
