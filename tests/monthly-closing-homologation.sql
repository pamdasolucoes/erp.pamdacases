-- Synthetic management records only. The inner subtransaction is always rolled back.
do $qa$
declare u uuid;d jsonb;r jsonb;snapshot jsonb;rejected boolean:=false;
begin
 begin
 select user_id into u from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 if u is null then raise exception 'QA requires an active administrator';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 if exists(select 1 from pamda_private.monthly_closings where owner_id=u and month='2099-11') then raise exception 'QA period is occupied';end if;
 d:=jsonb_build_object('month','2099-11','start','2099-11-01','end','2099-11-30',
 'rules',jsonb_build_object('pamBps',2000,'pamMinimumCents',170000,'reserveBps',1000,'thalesCents',207300,'thalesFrom','2026-09','thalesUntil',null),
 'shop',jsonb_build_object('mode','manual','snapshot',null,'profitCents',1000000,'shippingCents',0,'reason','QA sintética com rollback'),
 'expenses','[]'::jsonb,'shopeeReceipts','[]'::jsonb,'shopeeCosts','[]'::jsonb,'couriers','[]'::jsonb,'timeEntries','[]'::jsonb,'withdrawalDeductions','[]'::jsonb,
 'payments',jsonb_build_object('thalesCents',0,'thalesOn','','pamCents',0,'pamOn','','withdrawalCents',0,'withdrawalOn',''),'notes','QA sintética sem pagamentos reais');
 r:=public.pamda_monthly_closing_write('2099-11',d,0,'save',gen_random_uuid());
 if r->'totals'->>'netProfitCents'<>'792700' or r->'totals'->>'pamCents'<>'170000' or r->'totals'->>'reserveCents'<>'62270' or r->'totals'->>'withdrawalCents'<>'560430' then raise exception 'QA monthly formula mismatch';end if;
 begin perform public.pamda_monthly_closing_write('2099-11',d,0,'save',gen_random_uuid());exception when serialization_failure then rejected:=true;end;
 if not rejected then raise exception 'QA stale version accepted';end if;
 r:=public.pamda_monthly_closing_write('2099-11',d,1,'close',gen_random_uuid());
 if r->>'status'<>'closed' then raise exception 'QA close not confirmed';end if;
 r:=public.pamda_monthly_closing_write('2099-11',d,2,'reopen',gen_random_uuid(),'QA conferência');
 if r->>'version'<>'3' or r->>'status'<>'draft' then raise exception 'QA reopening not confirmed';end if;
 snapshot:=public.pamda_monthly_closing_profit('2099-11-01','2099-11-30');
 if snapshot->>'start'<>'2099-11-01' or snapshot->>'id' is null then raise exception 'QA profitability contract failed';end if;
 if not exists(select 1 from pamda_private.monthly_profit_snapshots where id=(snapshot->>'id')::uuid and owner_id=u) then raise exception 'QA snapshot ownership failed';end if;
 perform set_config('request.jwt.claim.sub','',true);rejected:=false;
 begin perform public.pamda_monthly_closing_read('2099-11');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'QA anonymous access accepted';end if;
 raise exception using errcode='ZX001',message='monthly closing QA passed; rolling fixtures back';
 exception when sqlstate 'ZX001' then null;
 end;
end $qa$;
