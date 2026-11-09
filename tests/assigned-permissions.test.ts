import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {canAccessTab} from '../src/services/access';
import {hasPermission,changePermission,tabPermissions,permissionDependencies} from '../src/services/permissions';
import type {User,UserRole} from '../src/types/erp';
const user=(permissions:Record<string,boolean>={},role:UserRole='gerencial'):User=>({id:'test-user',username:'test',name:'Teste',active:true,role,permissions,createdAt:''});
const catalog=JSON.parse(readFileSync(new URL('./fixtures/permission-catalog.json',import.meta.url),'utf8')) as {key:string}[];

test('todas as ações cadastradas têm fluxo acessível, em qualquer perfil autorizado',()=>{
 for(const {key} of catalog.filter(p=>!p.key.startsWith('module.'))){
  assert.ok(key in permissionDependencies,'ação sem mapeamento: '+key);
  const permissions=changePermission({},key,true);
  for(const role of ['gerencial','venda_atendimento','financeiro','producao','estoque_expedicao'] as UserRole[]){
   const actor=user(permissions,role);assert.equal(hasPermission(actor,key),true);
   assert.ok(Object.keys(tabPermissions).some(tab=>tab!=='dashboard'&&canAccessTab(actor,tab)),key+' sem tela para '+role);
   assert.equal(hasPermission({...actor,active:false},key),false);
   assert.equal(hasPermission({...actor,mustChangePassword:true},key),false);
  }
 }
 for(const {key} of catalog.filter(p=>p.key.startsWith('module.'))) assert.ok(key.slice(7) in tabPermissions,key+' sem tela');
});
test('menu sozinho não concede ação e consulta não concede escrita, custos nem administração',()=>{
 const actor=user({'module.produtos':true,'sales.read':true});
 assert.equal(canAccessTab(actor,'produtos'),true);
 for(const key of ['products.manage','stock.cost','users.manage','finance.manage'])assert.equal(hasPermission(actor,key),false);
 assert.equal(hasPermission(user({'module.usuarios':true}),'users.manage'),false);
 assert.equal(canAccessTab(user({'products.manage':true,'module.produtos':false}),'produtos'),false);
 assert.equal(hasPermission(user(),'products.manage'),false);
});
test('ativar ação marca requisitos; revogar requisito bloqueia dependentes, sem conceder outras áreas',()=>{
 assert.equal(changePermission({'sales.draft':true,'module.nova_venda':false},'sales.confirm',true)['module.nova_venda'],true);
 let p=changePermission({},'sales.confirm',true);
 assert.equal(p['sales.draft'],true);assert.equal(p['sales.read'],true);assert.equal(p['module.nova_venda'],true);
 assert.equal(p['finance.manage'],undefined);assert.equal(p['users.manage'],undefined);
 p=changePermission(p,'sales.draft',false);assert.equal(p['sales.confirm'],false);assert.equal(p['sales.read'],true);
 const read=changePermission({},'stock.read',true);assert.equal(read['stock.manage'],undefined);assert.equal(read['stock.cost'],undefined);
});
