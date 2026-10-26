-- Run inside BEGIN / ROLLBACK. Temporary permission changes never persist.
select set_config('qa.cost_user',(select user_id::text from public.erp_user_profiles where active and role='venda_atendimento' limit 1),true);
insert into public.erp_user_permission_overrides(user_id,permission_key,allowed,reason)
values(current_setting('qa.cost_user')::uuid,'stock.cost',false,'QA transacional') on conflict(user_id,permission_key) do update set allowed=false;
select set_config('request.jwt.claim.sub',current_setting('qa.cost_user'),true);
set local role authenticated;
do $$ declare denied boolean:=false; begin
 if not exists(select 1 from public.erp_product_catalog) then raise exception 'Catálogo indisponível'; end if;
 if exists(select 1 from public.erp_product_catalog where current_cost is not null or managerial_cost is not null) then raise exception 'Custo vazou no catálogo'; end if;
 begin perform current_cost from public.products limit 1;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Leitura direta de custos liberada'; end if;
 denied:=false;
 begin perform unit_cost_snapshot from public.erp_sale_items limit 1;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Snapshot de custo liberado'; end if;
 if exists(select 1 from public.erp_sales s where status='confirmed' and not is_test and (public.pamda_sale_movement_read(s.id)->'items'->0) ? 'unit_cost_snapshot') then raise exception 'Custo vazou na consulta'; end if;
end $$;
reset role;
update public.erp_user_permission_overrides set allowed=true where user_id=current_setting('qa.cost_user')::uuid and permission_key='stock.cost';
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.erp_product_catalog where current_cost is not null) then raise exception 'Custo autorizado indisponível'; end if;
 if not exists(select 1 from public.erp_sales s where status='confirmed' and not is_test and (public.pamda_sale_movement_read(s.id)->'items'->0) ? 'unit_cost_snapshot') then raise exception 'Custo histórico autorizado indisponível'; end if;
end $$;
reset role;
