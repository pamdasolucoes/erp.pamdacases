import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createMonthlyClosing,calculateMonthlyClosing} from '../src/services/monthlyClosingCalculation';
import type {MonthlyClosingData,MonthlyClosingRecord,ShopSnapshot} from '../src/types/monthlyClosing';
import {uuid} from './fixtures/customerRows';

test('fechamento privado valida cálculos, permissões, snapshots, versões, fechamento e isolamento entre administradores',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role authenticated;create role anon;create schema auth;create schema pamda_private;
      create table auth.users(id uuid primary key);create table public.erp_user_profiles(user_id uuid,role text,active boolean);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function pamda_private.require_permission(text) returns void language plpgsql as $$begin if auth.uid() is null then raise exception 'Sem permissão' using errcode='42501';end if;end$$;
      create function public.pamda_operation_read(text,date,date) returns jsonb language sql as $$select coalesce(nullif(current_setting('qa.report',true),''),'{}')::jsonb$$;
      grant usage on schema public,auth to authenticated,anon;`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261118145350_private_monthly_closing.sql',import.meta.url),'utf8'));
    for(const [id,role]of [[uuid(1),'admin_gerencial'],[uuid(2),'admin_gerencial'],[uuid(3),'financeiro'],[uuid(4),'gerencial']]){
      await db.query('insert into auth.users values($1);',[id]);await db.query('insert into public.erp_user_profiles values($1,$2,true)',[id,role]);
    }
    const actor=async(id:string)=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
    const read=async(month:string)=>(await db.query<{data:any}>('select public.pamda_monthly_closing_read($1) data',[month])).rows[0].data;
    let request=100;
    const write=async(d:MonthlyClosingData,version:number,action='save',key=uuid(request++),reason:string|null=null)=>(await db.query<{data:MonthlyClosingRecord}>('select public.pamda_monthly_closing_write($1,$2::jsonb,$3,$4,$5,$6) data',[d.month,JSON.stringify(d),version,action,key,reason])).rows[0].data;
    await actor(uuid(1));assert.deepEqual(await read('2026-11'),{record:null,defaults:null,months:[]});
    const data=createMonthlyClosing('2026-11');data.shop={mode:'manual',snapshot:null,profitCents:1000000,shippingCents:5000,reason:'Conferência sintética'};
    data.expenses=[{id:'expense',description:'Conta sintética',reference:'NOV',amountCents:1000,reductionCents:200,dueDate:data.start,paidCents:900,paidOn:data.start}];
    data.shopeeReceipts=[{id:'receipt',date:data.start,description:'Saque sintético',amountCents:200000}];data.shopeeCosts=[{id:'cost',date:data.start,description:'Custo sintético',amountCents:30000}];
    data.couriers=[{id:'courier',date:data.start,name:'Motoboy sintético',quantity:7,rateCents:1000,gasCents:2000,cashCents:13000,advanceCents:0,paidCents:-4000}];
    data.timeEntries=[{id:'point',date:data.start,name:'Pessoa sintética',start:'08:00',end:'18:00',breakMinutes:60,expectedMinutes:480,hourCents:1000,extraHourCents:1500}];
    data.withdrawalDeductions=[{id:'deduction',date:data.start,description:'Adiantamento sintético',amountCents:10000}];
    const key=uuid(99),first=await write(data,0,'save',key);assert.deepEqual(first.totals,calculateMonthlyClosing(data));
    const repeated=await write(data,0,'save',key);assert.equal(repeated.version,1);assert.equal((await db.query<{n:number}>('select count(*)::int n from pamda_private.monthly_closing_versions')).rows[0].n,1);
    await assert.rejects(()=>write({...data,notes:'outra aba'},0),/outra aba/);
    await assert.rejects(()=>write({...data,notes:'chave trocada'},0,'save',key),/Chave/);
    const closed=await write(data,1,'close');assert.equal(closed.status,'closed');assert.deepEqual(closed.totals,calculateMonthlyClosing(data));
    await assert.rejects(()=>write(data,2),/Mês fechado/);await assert.rejects(()=>write(data,2,'reopen'),/motivo/);
    const reopened=await write(data,2,'reopen',undefined,'Conferência administrativa');assert.equal(reopened.version,3);assert.equal(reopened.status,'draft');
    assert.deepEqual((await read('2026-11')).defaults,data.rules);

    // A fresh server snapshot overrides tampered amounts and belongs only to its owner.
    await db.query("select set_config('qa.report',$1,false)",[JSON.stringify({rows:[{subtotal:'100.00',discount_amount:'10.00',shipping_charged:'5.00',product_cost:'20.005',cost_verified:true}]})]);
    const snap=(await db.query<{data:ShopSnapshot}>("select public.pamda_monthly_closing_profit('2026-10-01','2026-10-31') data")).rows[0].data;
    assert.equal(snap.profitCents,6999);assert.equal(snap.shippingCents,500);
    const erp=createMonthlyClosing('2026-10');erp.shop.snapshot={...snap,profitCents:9999999,shippingCents:123};
    const real=await write(erp,0,'close');assert.equal(real.data.shop.snapshot?.profitCents,6999);assert.deepEqual(real.totals,calculateMonthlyClosing(real.data));
    await actor(uuid(2));assert.equal((await read('2026-11')).record,null);assert.deepEqual((await read('2026-11')).months,[]);
    await assert.rejects(()=>write(erp,0),/Atualize o lucro/);
    await actor(uuid(1));
    const overlapping=createMonthlyClosing('2026-12');overlapping.start=erp.start;overlapping.end=erp.end;overlapping.shop.snapshot=snap;
    await assert.rejects(()=>write(overlapping,0,'close'),/já contabilizados/);
    await db.query("select set_config('qa.report',$1,false)",[JSON.stringify({rows:[{subtotal:'100.00',discount_amount:'0',shipping_charged:'0',product_cost:null,cost_verified:false}]})]);
    const missing=(await db.query<{data:ShopSnapshot}>("select public.pamda_monthly_closing_profit('2026-12-01','2026-12-31') data")).rows[0].data;
    const pending=createMonthlyClosing('2026-12');pending.shop.snapshot=missing;
    assert.equal((await write(pending,0)).totals.pamCents,null);await assert.rejects(()=>write(pending,1,'close'),/custos pendentes/);

    // Compare SQL and browser math for thresholds, zero, loss and custom rates.
    for(let i=0;i<24;i++){
      const d=createMonthlyClosing('2026-06');d.shop={mode:'manual',snapshot:null,profitCents:i===0?-10000:i*103103,shippingCents:i*17,reason:'Teste de cálculo'};
      d.rules.pamBps=i*123;d.rules.reserveBps=i*87;
      const sql=(await db.query<{data:any}>('select pamda_private.monthly_totals($1::jsonb) data',[JSON.stringify(d)])).rows[0].data;
      assert.deepEqual(sql,calculateMonthlyClosing(d));
    }
    const large=createMonthlyClosing('2026-06');large.rules.pamBps=3333;
    large.shop.snapshot={id:uuid(999),start:large.start,end:large.end,capturedAt:new Date().toISOString(),saleCount:1,pendingCostCount:0,profitCents:2000000000000000,shippingCents:500};
    assert.deepEqual((await db.query<{data:any}>('select pamda_private.monthly_totals($1::jsonb) data',[JSON.stringify(large)])).rows[0].data,calculateMonthlyClosing(large));
    for(const id of [uuid(3),uuid(4)]){await actor(id);await assert.rejects(()=>read('2026-11'),/exclusivo/);await assert.rejects(()=>write(data,0),/exclusivo/);}
    await actor(uuid(1));await db.exec('set role authenticated');
    await assert.rejects(()=>db.query('select * from pamda_private.monthly_closings'),/permission denied/);
    await assert.rejects(()=>db.query('select pamda_private.monthly_totals($1::jsonb)',[JSON.stringify(data)]),/permission denied/);
    await db.exec('reset role;set role anon');await assert.rejects(()=>read('2026-11'),/permission denied/);await db.exec('reset role');
  }finally{await db.close();}
});
