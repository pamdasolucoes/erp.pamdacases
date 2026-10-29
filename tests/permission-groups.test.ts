import test from 'node:test';
import assert from 'node:assert/strict';
import {groupPermissions} from '../src/services/permissionGroups';

test('permissões são organizadas por área, com menus separados das ações e sem perdas',()=>{
 const catalog=[{key:'users.manage',description:'Gerenciar usuários'},{key:'stock.cost',description:'Visualizar custos'},{key:'module.vendas',description:'Menu: Vendas'},{key:'sales.confirm',description:'Finalizar venda'},{key:'finance.read',description:'Consultar financeiro'},{key:'purchases.manage',description:'Compras'},{key:'production.read',description:'Produção'},{key:'future.read',description:'Permissão futura'}];
 const original=structuredClone(catalog),groups=groupPermissions(catalog);
 assert.deepEqual(groups.map(g=>g.title.slice(0,2)),['01','02','03','04','05','06','07']);
 assert.deepEqual(groups[0].menus.map(p=>p.key),['module.vendas']);
 assert.deepEqual(groups[0].actions.map(p=>p.key),['sales.confirm']);
 assert.deepEqual(groups.flatMap(g=>[...g.menus,...g.actions]).map(p=>p.key).sort(),catalog.map(p=>p.key).sort());
 assert.deepEqual(catalog,original);
});
