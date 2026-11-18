import type {Page} from '@playwright/test';
import {calculateMonthlyClosing} from '../../../src/services/monthlyClosingCalculation';
import type {MonthlyClosingRecord} from '../../../src/types/monthlyClosing';
import {uuid} from '../../fixtures/customerRows';

export async function mockMonthlyClosing(page:Page,allowed=true){
  const state={records:new Map<string,MonthlyClosingRecord>(),requests:[] as any[],reads:0,profitReads:0,pendingCosts:0,failAfterSave:false};
  const completed=new Map<string,MonthlyClosingRecord>();
  await page.route('https://pamda-test.invalid/rest/v1/rpc/pamda_monthly_closing_*',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop()!,body=route.request().postDataJSON();
    const respond=(value:unknown,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(value)});
    if(!allowed)return respond({code:'42501',message:'Fechamento mensal exclusivo da administração'},403);
    if(name==='pamda_monthly_closing_read'){
      state.reads++;const rows=[...state.records.values()].sort((a,b)=>b.month.localeCompare(a.month));
      return respond({record:state.records.get(body.p_month)||null,defaults:rows[0]?.data.rules||null,months:rows.map(r=>({month:r.month,status:r.status,version:r.version}))});
    }
    if(name==='pamda_monthly_closing_profit'){
      state.profitReads++;return respond({id:uuid(80000+state.profitReads),start:body.p_start,end:body.p_end,capturedAt:new Date().toISOString(),saleCount:10,pendingCostCount:state.pendingCosts,profitCents:state.pendingCosts?null:1000000,shippingCents:20000});
    }
    state.requests.push(structuredClone(body));
    if(completed.has(body.p_request_key))return respond(completed.get(body.p_request_key));
    const previous=state.records.get(body.p_month);
    if((previous?.version||0)!==body.p_expected_version)return respond({code:'40001',message:'Este fechamento foi alterado em outra aba. Recarregue o mês.'},409);
    if(previous?.status==='closed'&&body.p_action!=='reopen')return respond({code:'P0001',message:'Mês fechado'},400);
    const data=body.p_action==='reopen'?previous!.data:body.p_data;
    const record:MonthlyClosingRecord={month:body.p_month,version:(previous?.version||0)+1,status:body.p_action==='close'?'closed':'draft',data:structuredClone(data),totals:calculateMonthlyClosing(data),updatedAt:new Date().toISOString(),closedAt:body.p_action==='close'?new Date().toISOString():null};
    state.records.set(body.p_month,record);completed.set(body.p_request_key,record);
    if(state.failAfterSave){state.failAfterSave=false;return route.abort('failed');}
    return respond(record);
  });
  return state;
}
