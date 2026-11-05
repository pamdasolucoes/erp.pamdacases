import test from 'node:test';import assert from 'node:assert/strict';
import {auditAction,auditDetails} from '../src/services/auditPresentation';
test('auditoria traduz ações, valores e referências mantendo o motivo completo',()=>{
 assert.equal(auditAction('sale_finalized'),'Venda finalizada');assert.equal(auditAction('cadastrar_cliente_com_matriz'),'Cliente e matriz cadastrados');
 const id='00000000-0000-4000-8000-000000000001';
 const rows=auditDetails({before:{method_code:'cash'},after:{method_code:'pix'},customer_id:id,reason:'Pagamento conferido no chat'},{[id]:'Cliente 350 · Cristalcel'});
 assert.ok(rows.some(r=>r.label==='Antes · Forma de pagamento'&&r.value==='Dinheiro'));
 assert.ok(rows.some(r=>r.value==='Cliente 350 · Cristalcel'));assert.ok(rows.some(r=>r.value==='Pagamento conferido no chat'));
});
