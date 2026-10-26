import test from 'node:test';
import assert from 'node:assert/strict';
import {profitabilityLine,profitabilityTotals,type ProfitabilityInput} from '../src/services/profitability';
const row=(overrides:Partial<ProfitabilityInput>={}):ProfitabilityInput=>({id:'sale',order_number:10000,confirmed_at:'2026-10-23T12:00:00Z',customer_name:'Cliente',subtotal:'25.00',discount_amount:'0.00',shipping_charged:'10.00',delivery_cost:null,product_cost:'5.00',cost_verified:true,...overrides});
test('capa de 25 com custo gerencial 5 gera lucro 20 e markup 400%, sem confundir frete com receita do produto',()=>{
 const line=profitabilityLine(row());assert.equal(line.profit,2000);assert.equal(line.markup,400);assert.equal(line.net,2500);assert.equal(line.shipping,1000);assert.equal(line.result,3000);
});
test('descontos e custo real de entrega reduzem resultado, sem descontar duas vezes o frete',()=>{
 const line=profitabilityLine(row({discount_amount:5,delivery_cost:8}));assert.equal(line.net,2000);assert.equal(line.profit,1500);assert.equal(line.markup,300);assert.equal(line.result,1700);
});
test('totais usam markup ponderado pelo custo; não média simples dos percentuais',()=>{
 const t=profitabilityTotals([profitabilityLine(row({delivery_cost:0})),profitabilityLine(row({subtotal:80,product_cost:5,shipping_charged:0,delivery_cost:0}))]);assert.equal(t.cost,1000);assert.equal(t.profit,9500);assert.equal(t.markup,950);assert.equal(t.result,10500);
});
test('custos ausentes e custo zero não geram lucro inventado ou divisão por zero',()=>{
 const missing=profitabilityLine(row({product_cost:null,cost_verified:false}));assert.equal(missing.profit,null);assert.equal(missing.markup,null);
 const free=profitabilityLine(row({product_cost:0,delivery_cost:0}));assert.equal(free.profit,2500);assert.equal(free.markup,null);
 assert.equal(profitabilityTotals([missing,free]).profit,null);assert.equal(profitabilityTotals([]).profit,0);
});
test('custos calculados pelo Postgres aceitam casas adicionais e arredondam por pedido',()=>{
 assert.equal(profitabilityLine(row({product_cost:'5.00000'})).cost,500);
 assert.equal(profitabilityLine(row({product_cost:'0.625'})).cost,63);
});
