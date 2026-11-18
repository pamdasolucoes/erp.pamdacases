import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {createMonthlyClosing,calculateMonthlyClosing} from '../src/services/monthlyClosingCalculation';import {mergeRecurringAccounts,syncPayroll,calculatePayroll} from '../src/services/recurringAccountCalculation';
import type {RecurringAccountData,AppliedAccounts} from '../src/types/recurringAccounts';import type {MonthlyClosingData} from '../src/types/monthlyClosing';import {uuid} from './fixtures/customerRows';
test('cadastros privados, folha calculada e lembretes respeitam mês, pagamentos, versões e acesso',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema pamda_private;create table auth.users(id uuid primary key);create table public.erp_user_profiles(user_id uuid,role text,active boolean);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function pamda_private.require_permission(text) returns void language plpgsql as $$begin if auth.uid() is null then raise exception 'Sem permissão' using errcode='42501';end if;end$$;
   create function public.pamda_operation_read(text,date,date) returns jsonb language sql as $$select '{"rows":[]}'::jsonb$$;grant usage on schema public,auth to authenticated,anon;`);
  for(const file of ['20261118145350_private_monthly_closing.sql','20261118154416_recurring_accounts_payroll_reminders.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  for(const [id,role]of [[uuid(1),'admin_gerencial'],[uuid(2),'admin_gerencial'],[uuid(3),'financeiro']]){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into public.erp_user_profiles values($1,$2,true)',[id,role]);}
  const actor=async(id:string)=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};await actor(uuid(1));
  const account:RecurringAccountData={name:'Aluguel sintético',kind:'account',category:'fixed',amountCents:100000,variable:true,dueDay:31,remindDays:5,active:true,fromMonth:'2026-11',untilMonth:null,notes:''};
  let key=100;
  const writeAccount=async(id:string,d:RecurringAccountData,version=0,request=uuid(key++))=>(await db.query<{v:any}>('select public.pamda_monthly_accounts_write($1,$2::jsonb,$3,$4) v',[id,JSON.stringify(d),version,request])).rows[0].v;
  const generate=async(month:string)=>(await db.query<{v:AppliedAccounts}>('select public.pamda_monthly_accounts_generate($1) v',[month])).rows[0].v;
  const save=async(d:MonthlyClosingData,version:number,action='save')=>(await db.query<{v:any}>('select public.pamda_monthly_closing_write($1,$2::jsonb,$3,$4,$5,null) v',[d.month,JSON.stringify(d),version,action,uuid(key++)])).rows[0].v;
  const alerts=async(day:string)=>(await db.query<{v:any}>('select public.pamda_monthly_accounts_alerts($1::date) v',[day])).rows[0].v;
  const request=uuid(90);await writeAccount(uuid(10),account,0,request);assert.equal((await writeAccount(uuid(10),account,0,request)).version,1);await assert.rejects(()=>writeAccount(uuid(10),account,0),/outra aba/);
  await writeAccount(uuid(11),{...account,name:'Imposto sintético',category:'tax',dueDay:10,amountCents:10000});
  await writeAccount(uuid(12),{...account,name:'Thales',kind:'thales',variable:false,dueDay:5,amountCents:207300});
  const payroll={name:'Pessoa sintética',baseSalaryCents:170000,advanceCents:70000,extraCents:0,otherReductionCents:0,divisorDays100:2100,absenceDays100:150,vtDays100:2300,vtRateCents:1200,vrDays100:2000,vrRateCents:2000,dueDays:{salary:null,advance:20,vt:null,vr:null}};
  await writeAccount(uuid(13),{...account,name:payroll.name,kind:'payroll',category:'salary',payroll});
  const g=await generate('2026-11');assert.equal(g.expenses.length,2);assert.equal(g.payroll.length,1);assert.equal(g.expenses[0].dueDate,'2026-11-30');
  const p=g.payroll[0],sql=(await db.query<{v:any}>('select pamda_private.monthly_payroll_totals($1::jsonb) v',[JSON.stringify(p)])).rows[0].v;assert.deepEqual(sql,calculatePayroll(p));
  let data=mergeRecurringAccounts(createMonthlyClosing('2026-11'),g).data;data.shop={mode:'manual',snapshot:null,profitCents:1000000,shippingCents:0,reason:'Teste sintético'};
  assert.deepEqual((await save(data,0)).totals,calculateMonthlyClosing(data));await assert.rejects(()=>save(data,1,'close'),/valores previstos/);
  data=syncPayroll(data,data.payroll!.map(p=>({...p,confirmed:true})));data.expenses=data.expenses.map(e=>({...e,amountConfirmed:true}));
  await assert.rejects(()=>save(data,1,'close'),/vencimentos/);
  assert.deepEqual(await alerts('2026-11-18'),{overdue:2,today:0,upcoming:1,unscheduled:3,firstMonth:'2026-11',checkedOn:'2026-11-18'});
  data.expenses=data.expenses.map(e=>({...e,dueDate:e.dueDate||'2026-11-25',paidCents:e.amountCents-e.reductionCents,paidOn:'2026-11-18'}));data.payments.thalesCents=207300;data.payments.thalesOn='2026-11-05';
  const closed=await save(data,1,'close');assert.equal(closed.status,'closed');assert.deepEqual(closed.totals,calculateMonthlyClosing(data));assert.equal((await alerts('2026-11-18')).overdue,0);assert.equal((await alerts('2026-11-18')).unscheduled,0);
  await writeAccount(uuid(10),{...account,amountCents:120000},1);const stored=(await db.query<{v:any}>("select public.pamda_monthly_closing_read('2026-11') v")).rows[0].v.record;assert.deepEqual(stored.data,data);
  assert.equal((await alerts('2026-12-01')).upcoming,1);assert.equal((await generate('2028-02')).expenses[0].dueDate,'2028-02-29');
  await actor(uuid(2));assert.deepEqual((await db.query<{v:any}>('select public.pamda_monthly_accounts_read() v')).rows[0].v,[]);assert.equal((await alerts('2026-11-18')).overdue,0);await assert.rejects(()=>save(data,0),/não encontrado/);
  await actor(uuid(3));await assert.rejects(()=>generate('2026-11'),/exclusivo/);await assert.rejects(()=>alerts('2026-11-18'),/exclusivo/);
  await actor(uuid(1));await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from pamda_private.monthly_account_templates'),/permission denied/);await db.exec('reset role;set role anon');await assert.rejects(()=>alerts('2026-11-18'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
