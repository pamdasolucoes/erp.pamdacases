-- Executar em BEGIN/ROLLBACK. Exercita SELECT sob o papel real authenticated.
do $$ declare u uuid:=gen_random_uuid(); actor uuid;begin
 select user_id into actor from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 insert into auth.users(id) values(u);
 insert into public.erp_user_profiles(user_id,username,display_name,role,active) values(u,'qa-'||u,'Validação de permissão','financeiro',true);
 insert into public.erp_user_permission_overrides(user_id,permission_key,allowed,assigned_by,reason) values(u,'customers.manage',true,actor,'Validação transacional');
 perform set_config('request.jwt.claim.sub',u::text,true);
end $$;
set local role authenticated;
do $$begin
 if not public.pamda_has_permission('customers.manage') then raise exception 'Permissão individual não efetiva';end if;
 if (select count(*) from public.customers)=0 then raise exception 'RLS bloqueou leitura autorizada';end if;
 if (select count(*) from public.customer_branches)=0 then raise exception 'RLS bloqueou unidades autorizadas';end if;
end $$;
reset role;
update public.erp_user_profiles set active=false where user_id=auth.uid();
set local role authenticated;
do $$begin if exists(select 1 from public.customers) then raise exception 'Inativo consultou clientes';end if;end $$;
reset role;
