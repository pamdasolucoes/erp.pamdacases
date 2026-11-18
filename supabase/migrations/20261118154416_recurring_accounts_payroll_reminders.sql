create table pamda_private.monthly_account_templates (
 owner_id uuid not null references auth.users(id),id uuid not null,version bigint not null check(version>0),data jsonb not null,
 source_key text,updated_at timestamptz not null default now(),last_request uuid not null,last_hash text not null,
 primary key(owner_id,id),unique(owner_id,source_key)
);
create unique index monthly_account_template_name on pamda_private.monthly_account_templates(owner_id,lower(btrim(data->>'name')));
create table pamda_private.monthly_account_template_versions (
 owner_id uuid not null,id uuid not null,version bigint not null,data jsonb not null,created_at timestamptz not null default now(),
 primary key(owner_id,id,version),foreign key(owner_id,id) references pamda_private.monthly_account_templates(owner_id,id)
);
alter table pamda_private.monthly_account_templates enable row level security;
alter table pamda_private.monthly_account_template_versions enable row level security;
create policy monthly_template_owner on pamda_private.monthly_account_templates using(owner_id=(select auth.uid()) and exists(select 1 from public.erp_user_profiles where user_id=(select auth.uid()) and active and role='admin_gerencial'));
create policy monthly_template_version_owner on pamda_private.monthly_account_template_versions using(owner_id=(select auth.uid()) and exists(select 1 from public.erp_user_profiles where user_id=(select auth.uid()) and active and role='admin_gerencial'));
revoke all on pamda_private.monthly_account_templates,pamda_private.monthly_account_template_versions from public,anon,authenticated;

create function pamda_private.monthly_due_date(m text,day integer) returns text language sql immutable set search_path='' as $$
 select case when day is null then '' else m||'-'||lpad(least(day,extract(day from ((m||'-01')::date+interval '1 month - 1 day'))::integer)::text,2,'0') end
$$;
create function pamda_private.monthly_payroll_totals(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare base bigint;advance bigint;extra bigint;other bigint;divisor bigint;absences bigint;vt bigint;vr bigint;absent bigint;reduction bigint;net bigint;advance_cost bigint;k text;
begin
 perform pamda_private.monthly_text(p->'name','nome da folha',100);
 base:=pamda_private.monthly_integer(p->'baseSalaryCents','salário-base');advance:=pamda_private.monthly_integer(p->'advanceCents','adiantamento');extra:=pamda_private.monthly_integer(p->'extraCents','adicionais');other:=pamda_private.monthly_integer(p->'otherReductionCents','outros descontos');
 divisor:=pamda_private.monthly_integer(p->'divisorDays100','dias-base',36600);absences:=pamda_private.monthly_integer(p->'absenceDays100','faltas',36600);
 if absences>0 and (divisor=0 or absences>divisor) then raise exception 'Informe os dias-base do mês para descontar as faltas';end if;
 absent:=case when absences=0 then 0 else round(base::numeric*absences/divisor)::bigint end;reduction:=absent+other;
 if reduction>base+extra then raise exception 'Os descontos excedem o salário e os adicionais';end if;
 net:=base+extra-reduction;advance_cost:=least(advance,net);
 vt:=round(pamda_private.monthly_integer(p->'vtRateCents','VT diário')::numeric*pamda_private.monthly_integer(p->'vtDays100','dias VT',36600)/100)::bigint;
 vr:=round(pamda_private.monthly_integer(p->'vrRateCents','VR diário')::numeric*pamda_private.monthly_integer(p->'vrDays100','dias VR',36600)/100)::bigint;
 for k in select unnest(array['salary','advance','vt','vr']) loop
  if not (p->'dueDays')?k then raise exception 'Confira os vencimentos da folha';end if;
  if p->'dueDays'->k<>'null'::jsonb and pamda_private.monthly_integer(p->'dueDays'->k,'vencimento',31)<1 then raise exception 'Vencimento deve ser entre 1 e 31';end if;
 end loop;
 return jsonb_build_object('absenceCents',absent,'reductionCents',reduction,'advanceCostCents',advance_cost,'salaryGrossCents',base+extra-advance_cost,'salaryNetCents',net-advance_cost,'vtCents',vt,'vrCents',vr);
end$$;
create function pamda_private.monthly_payroll_expenses(p jsonb,m text) returns jsonb language plpgsql immutable set search_path='' as $$
declare totals jsonb:=pamda_private.monthly_payroll_totals(p);rows jsonb:='[]';part text;label text;amount bigint;reduction bigint;
begin
 for part in select unnest(array['salary','advance','vt','vr']) loop
  label:=case part when 'salary' then 'PAGAMENTO' when 'advance' then 'ADIANTAMENTO' when 'vt' then 'VT' else 'VR' end;
  amount:=case part when 'salary' then (totals->>'salaryGrossCents')::bigint when 'advance' then (totals->>'advanceCostCents')::bigint when 'vt' then (totals->>'vtCents')::bigint else (totals->>'vrCents')::bigint end;
  reduction:=case when part='salary' then (totals->>'reductionCents')::bigint else 0 end;
  rows:=rows||jsonb_build_array(jsonb_build_object('id','payroll:'||(p->>'id')||':'||part,'description',label||' '||(p->>'name'),'reference',m,'amountCents',amount,'reductionCents',reduction,
   'dueDate',pamda_private.monthly_due_date(m,(p->'dueDays'->>part)::integer),'paidCents',0,'paidOn','','sourceTemplateId',p->>'templateId','category',part,'employee',p->>'name','payrollId',p->>'id','payrollPart',part,'amountConfirmed',coalesce((p->>'confirmed')::boolean,false)));
 end loop;return rows;
end$$;
create function pamda_private.monthly_validate_template(d jsonb) returns void language plpgsql immutable set search_path='' as $$
begin
 perform pamda_private.monthly_text(d->'name','nome do cadastro');perform pamda_private.monthly_text(d->'notes','observações',2000,false);
 if coalesce(d->>'kind','') not in('account','payroll','thales','courier') or coalesce(d->>'category','') not in('fixed','tax','salary','advance','vt','vr','other') or jsonb_typeof(d->'variable') is distinct from 'boolean' or jsonb_typeof(d->'active') is distinct from 'boolean' then raise exception 'Tipo de cadastro inválido';end if;
 perform pamda_private.monthly_integer(d->'amountCents','valor previsto');perform pamda_private.monthly_integer(d->'remindDays','dias de aviso',30);
 if not d?'dueDay' or (d->'dueDay'<>'null'::jsonb and pamda_private.monthly_integer(d->'dueDay','vencimento',31)<1) then raise exception 'Informe vencimento entre 1 e 31, ou deixe em branco';end if;
 if not pamda_private.monthly_month(d->>'fromMonth') or not d?'untilMonth' or (d->'untilMonth'<>'null'::jsonb and (not pamda_private.monthly_month(d->>'untilMonth') or d->>'untilMonth'<d->>'fromMonth')) then raise exception 'Confira a vigência do cadastro';end if;
 if d->>'kind'='payroll' then
  if d->'payroll'->>'name' is distinct from d->>'name' then raise exception 'Nome da folha divergente';end if;perform pamda_private.monthly_payroll_totals(d->'payroll');
 end if;
end$$;
create function public.pamda_monthly_accounts_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=pamda_private.monthly_require_admin();result jsonb;begin
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'data',data,'updatedAt',updated_at) order by data->>'name'),'[]') into result from pamda_private.monthly_account_templates where owner_id=u;return result;
end$$;
create function public.pamda_monthly_accounts_write(p_id uuid,p_data jsonb,p_expected_version bigint,p_request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=pamda_private.monthly_require_admin();r pamda_private.monthly_account_templates;hash text;begin
 if p_id is null or p_request_key is null or p_expected_version is null or p_expected_version<0 or octet_length(p_data::text)>30000 then raise exception 'Solicitação inválida';end if;
 perform pamda_private.monthly_validate_template(p_data);
 perform pg_advisory_xact_lock(hashtextextended('pamda-monthly-owner:'||u::text,0));
 select * into r from pamda_private.monthly_account_templates where owner_id=u and id=p_id for update;hash:=md5(p_data::text||p_expected_version::text);
 if r.last_request=p_request_key then if r.last_hash<>hash then raise exception 'Chave já utilizada';end if;
 else
  if coalesce(r.version,0)<>p_expected_version then raise exception 'Cadastro alterado em outra aba. Recarregue os cadastros.' using errcode='40001';end if;
  if r.data->>'kind' in('thales','courier') and p_data->>'kind' is distinct from r.data->>'kind' then raise exception 'O tipo deste custo integrado deve ser preservado';end if;
  if r.id is null and (select count(*) from pamda_private.monthly_account_templates where owner_id=u)>=300 then raise exception 'Limite de 300 cadastros';end if;
  if p_data->>'kind' in('thales','courier') and exists(select 1 from pamda_private.monthly_account_templates where owner_id=u and id<>p_id and data->>'kind'=p_data->>'kind') then raise exception 'Este custo já tem cadastro integrado';end if;
  insert into pamda_private.monthly_account_templates(owner_id,id,version,data,last_request,last_hash) values(u,p_id,coalesce(r.version,0)+1,p_data,p_request_key,hash)
   on conflict(owner_id,id) do update set version=excluded.version,data=excluded.data,last_request=excluded.last_request,last_hash=excluded.last_hash,updated_at=clock_timestamp() returning * into r;
  insert into pamda_private.monthly_account_template_versions(owner_id,id,version,data) values(u,p_id,r.version,p_data);
 end if;
 return jsonb_build_object('id',r.id,'version',r.version,'data',r.data,'updatedAt',r.updated_at);
end$$;
create function pamda_private.monthly_generate_accounts(u uuid,m text) returns jsonb language plpgsql stable set search_path='' as $$
declare r pamda_private.monthly_account_templates;d jsonb;p jsonb;expenses jsonb:='[]';people jsonb:='[]';begin
 if not pamda_private.monthly_month(m) then raise exception 'Mês inválido';end if;
 for r in select * from pamda_private.monthly_account_templates where owner_id=u and (data->>'active')::boolean and data->>'fromMonth'<=m and (data->>'untilMonth' is null or data->>'untilMonth'>=m) order by data->>'name' loop
  d:=r.data;
  if d->>'kind'='account' then
   expenses:=expenses||jsonb_build_array(jsonb_build_object('id','recurring:'||r.id::text,'description',d->>'name','reference',m,'amountCents',(d->>'amountCents')::bigint,'reductionCents',0,'dueDate',pamda_private.monthly_due_date(m,(d->>'dueDay')::integer),'paidCents',0,'paidOn','','sourceTemplateId',r.id,'category',d->>'category','amountConfirmed',not (d->>'variable')::boolean));
  elsif d->>'kind'='payroll' then
   p:=d->'payroll'||jsonb_build_object('id',r.id,'templateId',r.id,'name',d->>'name','sourceNote',d->>'notes','confirmed',false);people:=people||jsonb_build_array(p);
  end if;
 end loop;return jsonb_build_object('expenses',expenses,'payroll',people);
end$$;
create function public.pamda_monthly_accounts_generate(p_month text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=pamda_private.monthly_require_admin();begin return pamda_private.monthly_generate_accounts(u,p_month);end$$;

create function pamda_private.monthly_validate_account_extensions(d jsonb,u uuid) returns void language plpgsql stable set search_path='' as $$
declare p jsonb;row jsonb;expected jsonb;saved jsonb;people jsonb:=coalesce(d->'payroll','[]');t uuid;kind text;begin
 if jsonb_typeof(people) is distinct from 'array' or jsonb_array_length(people)>100 or (select count(distinct x->>'id') from jsonb_array_elements(people)x)<>jsonb_array_length(people) then raise exception 'Folhas de pagamento repetidas ou inválidas';end if;
 if d?'recurringApplied' and jsonb_typeof(d->'recurringApplied') is distinct from 'boolean' then raise exception 'Cadastro mensal inválido';end if;
 if d?'appliedTemplateIds' then
  if jsonb_typeof(d->'appliedTemplateIds') is distinct from 'array' or jsonb_array_length(d->'appliedTemplateIds')>300 then raise exception 'Vínculos dos cadastros inválidos';end if;
  if exists(select 1 from jsonb_array_elements_text(d->'appliedTemplateIds')x where not exists(select 1 from pamda_private.monthly_account_templates where owner_id=u and id=x::uuid)) then raise exception 'Cadastro não encontrado' using errcode='42501';end if;
 end if;
 for p in select * from jsonb_array_elements(people) loop
  perform pamda_private.monthly_text(p->'id','identificador da folha',100);
  if jsonb_typeof(p->'confirmed') is distinct from 'boolean' then raise exception 'Confira a folha de pagamento';end if;
  if not exists(select 1 from pamda_private.monthly_account_templates where owner_id=u and id=(p->>'templateId')::uuid and data->>'kind'='payroll') then raise exception 'Cadastro de folha não encontrado' using errcode='42501';end if;
  expected:=pamda_private.monthly_payroll_expenses(p,d->>'month');
  select jsonb_agg(x) into saved from jsonb_array_elements(d->'expenses')x where x->>'payrollId'=p->>'id';
  if jsonb_array_length(coalesce(saved,'[]'))<>4 or (select count(distinct x->>'payrollPart') from jsonb_array_elements(saved)x)<>4 then raise exception 'Confira as quatro contas geradas pela folha';end if;
  for row in select * from jsonb_array_elements(expected) loop
   if not exists(select 1 from jsonb_array_elements(saved)x where x->>'payrollPart'=row->>'payrollPart' and x->'amountCents'=row->'amountCents' and x->'reductionCents'=row->'reductionCents' and x->'amountConfirmed'=p->'confirmed' and x->>'sourceTemplateId'=p->>'templateId') then raise exception 'Atualize salário, faltas, adiantamento, VT e VR pela folha';end if;
  end loop;
 end loop;
 for row in select * from jsonb_array_elements(d->'expenses') loop
  if row?'amountConfirmed' and jsonb_typeof(row->'amountConfirmed') is distinct from 'boolean' then raise exception 'Confira a confirmação do valor das contas';end if;
  if row?'payrollId' and not exists(select 1 from jsonb_array_elements(people)x where x->>'id'=row->>'payrollId') then raise exception 'Folha vinculada não encontrada';end if;
  if row?'sourceTemplateId' then
   select data->>'kind' into kind from pamda_private.monthly_account_templates where owner_id=u and id=(row->>'sourceTemplateId')::uuid;
   if kind is null or kind in('thales','courier') or (kind='payroll' and not row?'payrollId') then raise exception 'Cadastro da conta não encontrado ou custo já integrado' using errcode='42501';end if;
  end if;
 end loop;
end$$;
do $patch$
declare d text;begin
 select pg_get_functiondef('public.pamda_monthly_closing_write(text,jsonb,bigint,text,uuid,text)'::regprocedure) into d;
 if position('totals:=pamda_private.monthly_totals(d);' in d)=0 then raise exception 'Unexpected monthly closing definition';end if;
 d:=replace(d,'totals:=pamda_private.monthly_totals(d);',$checks$
 perform pamda_private.monthly_validate_account_extensions(d,u);
 totals:=pamda_private.monthly_totals(d);
 if p_action='close' then
  if exists(select 1 from pamda_private.monthly_account_templates t where t.owner_id=u and t.data->>'kind' in('account','payroll') and (t.data->>'active')::boolean and t.data->>'fromMonth'<=p_month and (t.data->>'untilMonth' is null or t.data->>'untilMonth'>=p_month) and not coalesce(d->'appliedTemplateIds','[]')?t.id::text) then raise exception 'Traga os novos cadastros para este mês antes de fechar';end if;
  if exists(select 1 from jsonb_array_elements(d->'expenses')x where x->>'amountConfirmed'='false' and (x->>'amountCents')::bigint-(x->>'reductionCents')::bigint>0)
    or exists(select 1 from jsonb_array_elements(coalesce(d->'payroll','[]'))x where x->>'confirmed'='false') then raise exception 'Confira os valores previstos das contas e da folha antes de fechar o mês';end if;
  if exists(select 1 from jsonb_array_elements(d->'expenses')x where x?'sourceTemplateId' and coalesce(x->>'dueDate','')='' and (x->>'amountCents')::bigint-(x->>'reductionCents')::bigint-(x->>'paidCents')::bigint>0) then raise exception 'Defina os vencimentos das contas ainda não pagas antes de fechar';end if;
 end if;$checks$);
 execute d;
end $patch$;

create function public.pamda_monthly_accounts_alerts(p_today date default (now() at time zone 'America/Sao_Paulo')::date) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=pamda_private.monthly_require_admin();m text;start_month text;generated jsonb;book pamda_private.monthly_closings;rows jsonb;row jsonb;p jsonb;tpl jsonb;rules jsonb;due date;balance bigint;confirmed boolean;lead integer;state text;first_month text;first_rank integer:=99;first_due date;rank integer;overdue integer:=0;today integer:=0;upcoming integer:=0;unscheduled integer:=0;
begin
 if p_today is null or p_today<'2000-01-01' or p_today>'2100-12-31' then raise exception 'Data de consulta inválida';end if;
 select min(data->>'fromMonth') into start_month from pamda_private.monthly_account_templates where owner_id=u and (data->>'active')::boolean;
 for m in
  select distinct value from (
   select to_char(x,'YYYY-MM') value from generate_series((coalesce(start_month,to_char(p_today,'YYYY-MM'))||'-01')::date,date_trunc('month',p_today)+interval '1 month',interval '1 month')x
   union select month from pamda_private.monthly_closings where owner_id=u
  )all_months order by value
 loop
  select * into book from pamda_private.monthly_closings where owner_id=u and month=m;
  rows:=coalesce(book.data->'expenses','[]');
  if book.status is distinct from 'closed' then
   generated:=pamda_private.monthly_generate_accounts(u,m);
   for p in select * from jsonb_array_elements(generated->'payroll') loop
    if not coalesce(book.data->'appliedTemplateIds','[]')?(p->>'templateId') and not exists(select 1 from jsonb_array_elements(rows)x where upper(x->>'description') like '%'||upper(p->>'name')||'%') then generated:=jsonb_set(generated,'{expenses}',(generated->'expenses')||pamda_private.monthly_payroll_expenses(p,m));end if;
   end loop;
   for row in select * from jsonb_array_elements(generated->'expenses') loop
    if not coalesce(book.data->'appliedTemplateIds','[]')?(row->>'sourceTemplateId') and not exists(select 1 from jsonb_array_elements(rows)x where x->>'sourceTemplateId'=row->>'sourceTemplateId' and not x?'payrollId' or upper(btrim(x->>'description'))=upper(btrim(row->>'description'))) then rows:=rows||jsonb_build_array(row);end if;
   end loop;
  end if;
  select data into tpl from pamda_private.monthly_account_templates where owner_id=u and data->>'kind'='thales' and (data->>'active')::boolean and data->>'fromMonth'<=m and (data->>'untilMonth' is null or data->>'untilMonth'>=m) limit 1;
  if tpl is not null then
   rules:=book.data->'rules';if rules is null then select data->'rules' into rules from pamda_private.monthly_closings where owner_id=u order by month desc limit 1;end if;
   rules:=coalesce(rules,'{"thalesCents":207300,"thalesFrom":"2026-09","thalesUntil":null}');
   if m>=rules->>'thalesFrom' and (rules->>'thalesUntil' is null or m<=rules->>'thalesUntil') then rows:=rows||jsonb_build_array(jsonb_build_object('description','THALES','amountCents',(rules->>'thalesCents')::bigint,'reductionCents',0,'paidCents',coalesce((book.data->'payments'->>'thalesCents')::bigint,0),'dueDate',pamda_private.monthly_due_date(m,(tpl->>'dueDay')::integer),'sourceTemplateId',(select id from pamda_private.monthly_account_templates where owner_id=u and data->>'kind'='thales' limit 1),'amountConfirmed',true));end if;
  end if;
  for row in select * from jsonb_array_elements(rows) loop
   balance:=(row->>'amountCents')::bigint-(row->>'reductionCents')::bigint-(row->>'paidCents')::bigint;confirmed:=coalesce((row->>'amountConfirmed')::boolean,true);
   if balance<=0 and confirmed then continue;end if;
   due:=nullif(row->>'dueDate','')::date;lead:=5;
   if row?'sourceTemplateId' then select coalesce((data->>'remindDays')::integer,5) into lead from pamda_private.monthly_account_templates where owner_id=u and id=(row->>'sourceTemplateId')::uuid;end if;
   if due is null then if m>to_char(p_today,'YYYY-MM') then continue;end if;state:='unscheduled';rank:=3;
   elsif due<p_today then state:='overdue';rank:=0;
   elsif due=p_today then state:='today';rank:=1;
   elsif due<=p_today+coalesce(lead,5) then state:='upcoming';rank:=2;else continue;end if;
   if state='overdue' then overdue:=overdue+1;elsif state='today' then today:=today+1;elsif state='upcoming' then upcoming:=upcoming+1;else unscheduled:=unscheduled+1;end if;
   if rank<first_rank or rank=first_rank and coalesce(due,(m||'-01')::date)<coalesce(first_due,'9999-01-01'::date) then first_rank:=rank;first_due:=coalesce(due,(m||'-01')::date);first_month:=m;end if;
  end loop;
 end loop;return jsonb_build_object('overdue',overdue,'today',today,'upcoming',upcoming,'unscheduled',unscheduled,'firstMonth',first_month,'checkedOn',p_today);
end$$;

revoke all on function pamda_private.monthly_due_date(text,integer),pamda_private.monthly_payroll_totals(jsonb),pamda_private.monthly_payroll_expenses(jsonb,text),pamda_private.monthly_validate_template(jsonb),pamda_private.monthly_generate_accounts(uuid,text),pamda_private.monthly_validate_account_extensions(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.pamda_monthly_accounts_read(),public.pamda_monthly_accounts_write(uuid,jsonb,bigint,uuid),public.pamda_monthly_accounts_generate(text),public.pamda_monthly_accounts_alerts(date) from public,anon;
grant execute on function public.pamda_monthly_accounts_read(),public.pamda_monthly_accounts_write(uuid,jsonb,bigint,uuid),public.pamda_monthly_accounts_generate(text),public.pamda_monthly_accounts_alerts(date) to authenticated;
