import { expect, test } from '@playwright/test';
import { setup } from './support/mockErp';
import { productId } from '../fixtures/officialProducts';

test('admin vê impacto e precisa confirmar; cancelar não escreve', async ({page}) => {
 const {state}=await setup(page);
 await page.getByRole('button',{name:'Produtos & Serviços',exact:true}).click();
 const row=page.getByTestId(`product-${productId(1)}`);
 await row.getByRole('button',{name:'Excluir produto',exact:true}).click();
 await expect(page.getByText('Excluir produto — arquivamento seguro',{exact:true})).toBeVisible();
 await expect(page.getByText(/Nenhum registro será apagado/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Confirmar arquivamento',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await row.getByRole('button',{name:'Alterar SKU',exact:true}).click();
 await expect(page.getByLabel('Novo SKU')).toHaveValue('SKU-CAPA-201');
 await expect(page.getByRole('button',{name:'Confirmar alteração',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 expect(state.writes).toEqual([]);
});

test('vendedor não recebe ações administrativas', async ({page}) => {
 await setup(page,'venda_atendimento');
 await page.getByRole('button',{name:'Produtos & Serviços',exact:true}).click();
 await expect(page.getByTestId(`product-${productId(1)}`)).toBeVisible();
 await expect(page.getByRole('button',{name:'Alterar SKU',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Excluir produto',exact:true})).toHaveCount(0);
});
