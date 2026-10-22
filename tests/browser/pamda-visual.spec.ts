import {test,expect} from '@playwright/test';
import {setup} from './support/mockErp';
test('número disponível antes do cliente e identidade Pamda em desktop e celular',async({page})=>{
 const {sales}=await setup(page);
 await page.getByRole('navigation').getByRole('button',{name:'Nova Venda',exact:true}).click();
 await expect(page.getByRole('heading',{name:/NOVA VENDA.*Nº 10\.000/})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Cliente',exact:true})).toHaveValue('');
 expect(sales.sales).toHaveLength(0);
 await expect(page.getByText('Iniciando…',{exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/pamda-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect.poll(async()=>page.locator('aside').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'test-results/pamda-mobile.png',fullPage:true});
});
