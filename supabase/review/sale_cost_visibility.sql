update public.erp_permission_catalog set description='Visualizar custos dos produtos, vendas e estoque' where key='stock.cost';

create function public.pamda_product_costs(p_product_id uuid) returns table(current_cost numeric,managerial_cost numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.pamda_has_permission('stock.cost') then return query select null::numeric,null::numeric;return;end if;
 return query select p.current_cost,p.managerial_cost from public.products p where id=p_product_id;
end $$;
revoke all on function public.pamda_product_costs(uuid) from public,anon;
grant execute on function public.pamda_product_costs(uuid) to authenticated;

-- Preserve RLS and non-cost catalog access; never grant direct cost-column reads.
do $$ declare cols text; projection text; begin
 select string_agg(format('%I',column_name),',' order by ordinal_position),string_agg(case when column_name in ('current_cost','managerial_cost') then 'c.'||quote_ident(column_name) else 'p.'||quote_ident(column_name) end,',' order by ordinal_position)
 into cols,projection from information_schema.columns where table_schema='public' and table_name='products';
 execute 'create view public.erp_product_catalog with(security_invoker=true,security_barrier=true) as select '||projection||' from public.products p cross join lateral public.pamda_product_costs(p.id) c';
 revoke select on public.products from authenticated,anon,public;
 select string_agg(format('%I',column_name),',' order by ordinal_position) into cols from information_schema.columns where table_schema='public' and table_name='products' and column_name not in ('current_cost','managerial_cost');
 execute 'grant select ('||cols||') on public.products to authenticated';
 revoke select on public.erp_sale_items from authenticated,anon,public;
 select string_agg(format('%I',column_name),',' order by ordinal_position) into cols from information_schema.columns where table_schema='public' and table_name='erp_sale_items' and column_name not in ('unit_cost_snapshot','direct_unit_cost_snapshot');
 execute 'grant select ('||cols||') on public.erp_sale_items to authenticated';
end $$;
revoke all on public.erp_product_catalog from authenticated,anon,public;
grant select on public.erp_product_catalog to authenticated;

-- Closed orders use the cost frozen at finalization, never today's catalog cost.
do $$ declare d text; begin
 select pg_get_functiondef('public.pamda_sale_movement_read(uuid)'::regprocedure) into d;
 d:=replace(d,'''can_maintain'',public.pamda_has_permission(''sales.maintain'')','''can_maintain'',public.pamda_has_permission(''sales.maintain''),''can_view_cost'',public.pamda_has_permission(''stock.cost'')');
 d:=replace(d,'to_jsonb(i)-''unit_cost_snapshot''-''direct_unit_cost_snapshot''-''cost_verified''','case when public.pamda_has_permission(''stock.cost'') then to_jsonb(i)-''direct_unit_cost_snapshot''-''cost_verified'' else to_jsonb(i)-''unit_cost_snapshot''-''direct_unit_cost_snapshot''-''cost_verified'' end');
 execute d;
end $$;
