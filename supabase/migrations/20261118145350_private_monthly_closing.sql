-- Personal management workbook: no posting to sales, stock, payroll or payment ledgers.
create table pamda_private.monthly_closings (
 owner_id uuid not null references auth.users(id),month text not null check(month~'^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'),
 version bigint not null check(version>0),status text not null check(status in('draft','closed')),
 data jsonb not null,totals jsonb not null,updated_at timestamptz not null default now(),closed_at timestamptz,
 last_request uuid not null,last_hash text not null,primary key(owner_id,month)
);
create table pamda_private.monthly_profit_snapshots (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 start_date date not null,end_date date not null,captured_at timestamptz not null default now(),
 sale_count integer not null,pending_cost_count integer not null,profit_cents bigint,shipping_cents bigint not null
);
create index monthly_profit_snapshots_owner on pamda_private.monthly_profit_snapshots(owner_id,id);
create table pamda_private.monthly_closing_versions (
 owner_id uuid not null,month text not null,version bigint not null,status text not null,data jsonb not null,totals jsonb not null,
 reason text,created_at timestamptz not null default now(),primary key(owner_id,month,version),
 foreign key(owner_id,month) references pamda_private.monthly_closings(owner_id,month)
);
alter table pamda_private.monthly_closings enable row level security;
alter table pamda_private.monthly_profit_snapshots enable row level security;
alter table pamda_private.monthly_closing_versions enable row level security;
create policy monthly_closing_owner on pamda_private.monthly_closings using(owner_id=(select auth.uid()) and exists(select 1 from public.erp_user_profiles where user_id=(select auth.uid()) and active and role='admin_gerencial'));
create policy monthly_snapshot_owner on pamda_private.monthly_profit_snapshots using(owner_id=(select auth.uid()) and exists(select 1 from public.erp_user_profiles where user_id=(select auth.uid()) and active and role='admin_gerencial'));
create policy monthly_version_owner on pamda_private.monthly_closing_versions using(owner_id=(select auth.uid()) and exists(select 1 from public.erp_user_profiles where user_id=(select auth.uid()) and active and role='admin_gerencial'));
revoke all on pamda_private.monthly_closings,pamda_private.monthly_profit_snapshots,pamda_private.monthly_closing_versions from public,anon,authenticated;

create function pamda_private.monthly_require_admin() returns uuid language plpgsql stable set search_path='' as $$
declare u uuid:=(select auth.uid());begin
 perform pamda_private.require_permission('settings.manage');
 if u is null or not exists(select 1 from public.erp_user_profiles where user_id=u and active and role='admin_gerencial') then
  raise exception 'Fechamento mensal é exclusivo da administração' using errcode='42501';end if;return u;
end$$;
create function pamda_private.monthly_integer(v jsonb,label text,maximum numeric default 100000000000,signed boolean default false) returns bigint language plpgsql immutable set search_path='' as $$
declare n numeric;begin
 if jsonb_typeof(v) is distinct from 'number' then raise exception 'Valor inválido: %',label;end if;
 n:=v::text::numeric;
 if n<>trunc(n) or abs(n)>maximum or (not signed and n<0) then raise exception 'Valor inválido: %',label;end if;
 return n::bigint;
end$$;
create function pamda_private.monthly_text(v jsonb,label text,maximum integer default 300,required boolean default true) returns text language plpgsql immutable set search_path='' as $$
declare t text;begin
 if jsonb_typeof(v) is distinct from 'string' then raise exception 'Texto inválido: %',label;end if;t:=v#>>'{}';
 if length(t)>maximum or (required and btrim(t)='') then raise exception 'Confira %',label;end if;return t;
end$$;
create function pamda_private.monthly_date(v text) returns date language plpgsql immutable set search_path='' as $$
declare d date;begin
 if v is null or v!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida';end if;
 d:=v::date;if to_char(d,'YYYY-MM-DD')<>v then raise exception 'Data inválida';end if;return d;
end$$;
create function pamda_private.monthly_month(v text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(v~'^\d{4}-(0[1-9]|1[0-2])$' and v between '2000-01' and '2100-12',false)
$$;
create function pamda_private.monthly_record(r pamda_private.monthly_closings) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('month',r.month,'version',r.version,'status',r.status,'data',r.data,'totals',r.totals,'updatedAt',r.updated_at,'closedAt',r.closed_at)
$$;

create function pamda_private.monthly_totals(d jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare r jsonb:=d->'rules';v jsonb;rows jsonb;k text;t text;day date;s date;e date;month text:=d->>'month';
 expense bigint:=0;expense_paid bigint:=0;thales bigint;thales_paid bigint;pam_paid bigint;withdrawal_paid bigint;
 receipt bigint:=0;shopee_cost bigint:=0;courier_cost bigint:=0;courier_due bigint:=0;courier_paid bigint:=0;deductions bigint:=0;
 shops_profit bigint;shops_shipping bigint;shop_total bigint;net_profit bigint;pam bigint;reserve bigint;withdrawal bigint;outflows bigint;
 pam_bps bigint;reserve_bps bigint;minimum bigint;gross bigint;reduction bigint;paid bigint;value bigint;
 worked bigint:=0;expected bigint:=0;extra bigint:=0;missing bigint:=0;time_value bigint:=0;
 start_min integer;end_min integer;duration integer;pause integer;planned integer;actual integer;over integer;
begin
 if jsonb_typeof(d) is distinct from 'object' or not pamda_private.monthly_month(month) then raise exception 'Mês inválido';end if;
 s:=pamda_private.monthly_date(d->>'start');e:=pamda_private.monthly_date(d->>'end');if e<s or e-s>62 then raise exception 'Informe um período válido de até 63 dias';end if;
 pam_bps:=pamda_private.monthly_integer(r->'pamBps','percentual PAM',10000);reserve_bps:=pamda_private.monthly_integer(r->'reserveBps','percentual reserva',10000);
 minimum:=pamda_private.monthly_integer(r->'pamMinimumCents','mínimo PAM');thales:=pamda_private.monthly_integer(r->'thalesCents','custo Thales');
 if not pamda_private.monthly_month(r->>'thalesFrom') or (r->'thalesUntil'<>'null'::jsonb and (not pamda_private.monthly_month(r->>'thalesUntil') or r->>'thalesUntil'<r->>'thalesFrom')) or not r?'thalesUntil' then raise exception 'Confira a vigência do custo do Thales';end if;
 if month<r->>'thalesFrom' or (r->>'thalesUntil' is not null and month>r->>'thalesUntil') then thales:=0;end if;
 perform pamda_private.monthly_text(d->'notes','observações',10000,false);
 for k in select unnest(array['expenses','shopeeReceipts','shopeeCosts','couriers','timeEntries','withdrawalDeductions']) loop
  rows:=d->k;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)>500 then raise exception 'Lista inválida: %',k;end if;
  if (select count(distinct j->>'id') from jsonb_array_elements(rows)j)<>jsonb_array_length(rows) then raise exception 'Linhas repetidas: %',k;end if;
  for v in select * from jsonb_array_elements(rows) loop
   perform pamda_private.monthly_text(v->'id','identificação da linha',100);
   if k='expenses' then
    perform pamda_private.monthly_text(v->'description','descrição da conta');perform pamda_private.monthly_text(v->'reference','referência',100,false);
    gross:=pamda_private.monthly_integer(v->'amountCents','valor da conta');reduction:=pamda_private.monthly_integer(v->'reductionCents','redução');paid:=pamda_private.monthly_integer(v->'paidCents','pago');
    if reduction>gross then raise exception 'Redução maior que o valor da conta';end if;
    t:=pamda_private.monthly_text(v->'dueDate','vencimento',10,false);if t<>'' then perform pamda_private.monthly_date(t);end if;
    t:=pamda_private.monthly_text(v->'paidOn','data do pagamento',10,false);if t<>'' then perform pamda_private.monthly_date(t);elsif paid>0 then raise exception 'Informe a data do pagamento da conta';end if;
    expense:=expense+gross-reduction;expense_paid:=expense_paid+paid;
   else
    day:=pamda_private.monthly_date(v->>'date');if day<s or day>e then raise exception 'Lançamento fora do período: %',k;end if;
    if k in('shopeeReceipts','shopeeCosts','withdrawalDeductions') then
     perform pamda_private.monthly_text(v->'description','descrição do lançamento');value:=pamda_private.monthly_integer(v->'amountCents','valor');
     if k='shopeeReceipts' then receipt:=receipt+value;elsif k='shopeeCosts' then shopee_cost:=shopee_cost+value;else deductions:=deductions+value;end if;
    elsif k='couriers' then
     perform pamda_private.monthly_text(v->'name','motoboy');
     gross:=pamda_private.monthly_integer(v->'quantity','quantidade',100000)*pamda_private.monthly_integer(v->'rateCents','valor da entrega')+pamda_private.monthly_integer(v->'gasCents','combustível');
     courier_cost:=courier_cost+gross;courier_due:=courier_due+gross-pamda_private.monthly_integer(v->'cashCents','dinheiro recebido')-pamda_private.monthly_integer(v->'advanceCents','adiantamento');
     courier_paid:=courier_paid+pamda_private.monthly_integer(v->'paidCents','pago/recebido',100000000000,true);
    elsif k='timeEntries' then
     perform pamda_private.monthly_text(v->'name','nome da folha ponto');
     if coalesce(v->>'start','')!~'^([01]\d|2[0-3]):[0-5]\d$' or coalesce(v->>'end','')!~'^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Informe entrada e saída válidas na folha ponto';end if;
     start_min:=split_part(v->>'start',':',1)::integer*60+split_part(v->>'start',':',2)::integer;end_min:=split_part(v->>'end',':',1)::integer*60+split_part(v->>'end',':',2)::integer;
     duration:=case when end_min>=start_min then end_min-start_min else end_min+1440-start_min end;
     pause:=pamda_private.monthly_integer(v->'breakMinutes','intervalo',1440);planned:=pamda_private.monthly_integer(v->'expectedMinutes','jornada',1440);
     if pause>duration then raise exception 'Intervalo maior que a jornada registrada';end if;
     actual:=duration-pause;over:=greatest(0,actual-planned);worked:=worked+actual;expected:=expected+planned;extra:=extra+over;missing:=missing+greatest(0,planned-actual);
     time_value:=time_value+round((actual-over)*pamda_private.monthly_integer(v->'hourCents','valor hora')::numeric/60)::bigint+round(over*pamda_private.monthly_integer(v->'extraHourCents','valor hora extra')::numeric/60)::bigint;
    end if;
   end if;
  end loop;
 end loop;
 for k in select unnest(array['thales','pam','withdrawal']) loop
  paid:=pamda_private.monthly_integer(d->'payments'->(k||'Cents'),'pagamento do acerto');t:=pamda_private.monthly_text(d->'payments'->(k||'On'),'data do acerto',10,false);
  if t<>'' then perform pamda_private.monthly_date(t);elsif paid>0 then raise exception 'Informe a data do pagamento do acerto';end if;
  if k='thales' then thales_paid:=paid;elsif k='pam' then pam_paid:=paid;else withdrawal_paid:=paid;end if;
 end loop;
 perform pamda_private.monthly_integer(d->'shop'->'profitCents','lucro manual',100000000000,true);perform pamda_private.monthly_integer(d->'shop'->'shippingCents','frete manual');
 t:=pamda_private.monthly_text(d->'shop'->'reason','origem do lucro',2000,false);
 if d->'shop'->>'mode'='manual' then
  if btrim(t)='' then raise exception 'Informe a origem do lucro das lojas';end if;
  shops_profit:=(d->'shop'->>'profitCents')::bigint;shops_shipping:=(d->'shop'->>'shippingCents')::bigint;
 elsif d->'shop'->>'mode'='erp' then
  v:=d->'shop'->'snapshot';
  if jsonb_typeof(v)='object' then
   if v->>'start'<>d->>'start' or v->>'end'<>d->>'end' then raise exception 'Atualize o lucro das lojas para o período selecionado';end if;
   if pamda_private.monthly_integer(v->'pendingCostCount','custos pendentes',1000000)=0 and v->'profitCents'<>'null'::jsonb then
    shops_profit:=pamda_private.monthly_integer(v->'profitCents','lucro ERP',9007199254740991,true);shops_shipping:=pamda_private.monthly_integer(v->'shippingCents','frete ERP',9007199254740991);
   end if;
  end if;
 else raise exception 'Origem do lucro inválida';end if;
 outflows:=expense+thales+courier_cost;shop_total:=shops_profit+shops_shipping;net_profit:=shop_total+receipt-shopee_cost-outflows;
 pam:=case when net_profit is not null then greatest(round(greatest(0,net_profit)::numeric*pam_bps/10000)::bigint,minimum) end;
 reserve:=round(greatest(0,net_profit-pam)::numeric*reserve_bps/10000)::bigint;
 if net_profit is null then reserve:=null;end if;withdrawal:=net_profit-pam-reserve-deductions;
 v:=jsonb_build_object('expensesCents',expense,'expensesPaidCents',expense_paid,'expensesBalanceCents',expense-expense_paid,'thalesCents',thales,'thalesBalanceCents',thales-thales_paid,
 'shopeeReceivedCents',receipt,'shopeeCostCents',shopee_cost,'shopeeProfitCents',receipt-shopee_cost,'courierCostCents',courier_cost,'courierDueCents',courier_due,'courierPaidCents',courier_paid,'courierBalanceCents',courier_due-courier_paid,
 'totalOutflowsCents',outflows,'shopProfitCents',shops_profit,'shopShippingCents',shops_shipping,'shopTotalCents',shop_total,'netProfitCents',net_profit,'pamCents',pam,'pamBalanceCents',pam-pam_paid,'reserveCents',reserve,'withdrawalCents',withdrawal,'withdrawalBalanceCents',withdrawal-withdrawal_paid,'deductionsCents',deductions,
 'workedMinutes',worked,'expectedMinutes',expected,'extraMinutes',extra,'missingMinutes',missing,'timeValueCents',time_value);
 if exists(select 1 from jsonb_each(v)x where x.value<>'null'::jsonb and abs(x.value::text::numeric)>9007199254740991) then raise exception 'Total fora do limite de cálculo';end if;
 return v;
end$$;

create function public.pamda_monthly_closing_read(p_month text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=pamda_private.monthly_require_admin();r pamda_private.monthly_closings;defaults jsonb;months jsonb;
begin
 if not pamda_private.monthly_month(p_month) then raise exception 'Mês inválido';end if;
 select * into r from pamda_private.monthly_closings where owner_id=u and month=p_month;
 select data->'rules' into defaults from pamda_private.monthly_closings where owner_id=u order by month desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('month',month,'status',status,'version',version) order by month desc),'[]') into months from pamda_private.monthly_closings where owner_id=u;
 return jsonb_build_object('record',case when r.owner_id is not null then pamda_private.monthly_record(r) end,'defaults',defaults,'months',months);
end$$;
create function public.pamda_monthly_closing_profit(p_start date,p_end date) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=pamda_private.monthly_require_admin();report jsonb;v jsonb;n integer:=0;missing integer:=0;profit numeric:=0;shipping numeric:=0;r pamda_private.monthly_profit_snapshots;
begin
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>62 then raise exception 'Período inválido';end if;
 report:=public.pamda_operation_read('profitability',p_start,p_end);
 if jsonb_typeof(report->'rows') is distinct from 'array' then raise exception 'Relatório de lucratividade incompleto';end if;
 for v in select * from jsonb_array_elements(report->'rows') loop
  n:=n+1;shipping:=shipping+round((v->>'shipping_charged')::numeric*100);
  if v->>'cost_verified' is distinct from 'true' or v->>'product_cost' is null then missing:=missing+1;
  else profit:=profit+round((v->>'subtotal')::numeric*100)-round((v->>'discount_amount')::numeric*100)-round((v->>'product_cost')::numeric*100);end if;
 end loop;
 if abs(profit)>9007199254740991 or abs(shipping)>9007199254740991 then raise exception 'Relatório fora do limite de cálculo';end if;
 insert into pamda_private.monthly_profit_snapshots(owner_id,start_date,end_date,sale_count,pending_cost_count,profit_cents,shipping_cents)
 values(u,p_start,p_end,n,missing,case when missing=0 then profit::bigint end,shipping::bigint) returning * into r;
 return jsonb_build_object('id',r.id,'start',r.start_date,'end',r.end_date,'capturedAt',r.captured_at,'saleCount',r.sale_count,'pendingCostCount',r.pending_cost_count,'profitCents',r.profit_cents,'shippingCents',r.shipping_cents);
end$$;
create function public.pamda_monthly_closing_write(p_month text,p_data jsonb,p_expected_version bigint,p_action text,p_request_key uuid,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=pamda_private.monthly_require_admin();r pamda_private.monthly_closings;d jsonb:=p_data;totals jsonb;request_hash text;snap pamda_private.monthly_profit_snapshots;v_status text;v_version bigint;
begin
 if p_request_key is null or p_expected_version is null or p_expected_version<0 or not pamda_private.monthly_month(p_month) or p_action not in('save','close','reopen') or p_action is null or octet_length(p_data::text)>1000000 then raise exception 'Solicitação de fechamento inválida';end if;
 -- Serialize per owner, including closes of different months with overlapping periods.
 perform pg_advisory_xact_lock(hashtextextended('pamda-monthly-owner:'||u::text,0));
 select * into r from pamda_private.monthly_closings where owner_id=u and month=p_month for update;
 request_hash:=md5(coalesce(p_data::text,'')||p_action||p_expected_version::text||coalesce(p_reason,''));
 if r.last_request=p_request_key then
  if r.last_hash<>request_hash then raise exception 'Chave de solicitação já utilizada';end if;return pamda_private.monthly_record(r);
 end if;
 if coalesce(r.version,0)<>p_expected_version then raise exception 'Este fechamento foi alterado em outra aba. Salve uma cópia das suas anotações e recarregue o mês.' using errcode='40001';end if;
 if p_action='reopen' then
  if r.status is distinct from 'closed' or length(btrim(coalesce(p_reason,'')))<3 or length(p_reason)>1000 then raise exception 'Informe o motivo para reabrir um mês fechado';end if;
  d:=r.data;v_status:='draft';
 else
  if r.status='closed' then raise exception 'Mês fechado. Reabra para alterar os dados.';end if;
  v_status:=case when p_action='close' then 'closed' else 'draft' end;
 end if;
 if d->>'month' is distinct from p_month then raise exception 'Mês da solicitação divergente';end if;
 if d->'shop'->>'mode'='erp' and jsonb_typeof(d->'shop'->'snapshot')='object' then
  select * into snap from pamda_private.monthly_profit_snapshots where id=(d->'shop'->'snapshot'->>'id')::uuid and owner_id=u;
  if not found or snap.start_date::text<>d->>'start' or snap.end_date::text<>d->>'end' then raise exception 'Atualize o lucro das lojas para este período';end if;
  d:=jsonb_set(d,'{shop,snapshot}',jsonb_build_object('id',snap.id,'start',snap.start_date,'end',snap.end_date,'capturedAt',snap.captured_at,'saleCount',snap.sale_count,'pendingCostCount',snap.pending_cost_count,'profitCents',snap.profit_cents,'shippingCents',snap.shipping_cents));
 end if;
 totals:=pamda_private.monthly_totals(d);
 if p_action='close' then
  if totals->>'netProfitCents' is null then raise exception 'Atualize o lucro das lojas e confira os custos pendentes antes de fechar o mês';end if;
  if d->'shop'->>'mode'='erp' and exists(select 1 from pamda_private.monthly_closings other where owner_id=u and month<>p_month and status='closed' and other.data->'shop'->>'mode'='erp' and daterange((other.data->>'start')::date,(other.data->>'end')::date,'[]')&&daterange((d->>'start')::date,(d->>'end')::date,'[]')) then raise exception 'O período inclui dias já contabilizados em outro fechamento mensal';end if;
 end if;
 v_version:=coalesce(r.version,0)+1;
 insert into pamda_private.monthly_closings(owner_id,month,version,status,data,totals,updated_at,closed_at,last_request,last_hash)
 values(u,p_month,v_version,v_status,d,totals,clock_timestamp(),case when v_status='closed' then clock_timestamp() end,p_request_key,request_hash)
 on conflict(owner_id,month) do update set version=excluded.version,status=excluded.status,data=excluded.data,totals=excluded.totals,updated_at=excluded.updated_at,closed_at=excluded.closed_at,last_request=excluded.last_request,last_hash=excluded.last_hash returning * into r;
 insert into pamda_private.monthly_closing_versions(owner_id,month,version,status,data,totals,reason) values(u,p_month,v_version,v_status,d,totals,case when p_action='reopen' then p_reason end);
 return pamda_private.monthly_record(r);
end$$;

revoke all on function pamda_private.monthly_require_admin(),pamda_private.monthly_integer(jsonb,text,numeric,boolean),pamda_private.monthly_text(jsonb,text,integer,boolean),pamda_private.monthly_date(text),pamda_private.monthly_month(text),pamda_private.monthly_record(pamda_private.monthly_closings),pamda_private.monthly_totals(jsonb) from public,anon,authenticated;
revoke all on function public.pamda_monthly_closing_read(text),public.pamda_monthly_closing_profit(date,date),public.pamda_monthly_closing_write(text,jsonb,bigint,text,uuid,text) from public,anon;
grant execute on function public.pamda_monthly_closing_read(text),public.pamda_monthly_closing_profit(date,date),public.pamda_monthly_closing_write(text,jsonb,bigint,text,uuid,text) to authenticated;
