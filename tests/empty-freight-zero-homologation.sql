-- Execute inside BEGIN / ROLLBACK; no test data is persisted.
do $$ declare actor uuid;c uuid;b uuid;s uuid; begin
select user_id into actor from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
perform set_config('request.jwt.claim.sub',actor::text,true);
select id into c from public.customers where active limit 1;
select id into b from public.customer_branches where active and customer_id=c limit 1;
update public.customers set default_shipping_fee=null where id=c;
update public.customer_branches set shipping_fee_override=null where id=b;
s:=public.pamda_iniciar_venda(c,b,gen_random_uuid());
if not exists(select 1 from public.erp_sales where id=s and shipping_confirmed and shipping_charged=0) then raise exception 'Frete inicial não é zero'; end if;
perform public.pamda_salvar_rascunho_venda(c,b,'[]'::jsonb,10,0,null,null,s,null,null);
perform public.pamda_salvar_rascunho_venda(c,b,'[]'::jsonb,null,0,null,null,s,null,null);
if not exists(select 1 from public.erp_sales where id=s and shipping_confirmed and shipping_charged=0) then raise exception 'Apagar frete não zerou'; end if;
end $$;
