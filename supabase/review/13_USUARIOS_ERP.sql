create function public.pamda_users_read() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if not public.pamda_is_admin() then raise exception 'Administração de usuários restrita ao administrador' using errcode='42501'; end if;
 select jsonb_build_object('users',(select coalesce(jsonb_agg(to_jsonb(p) order by username),'[]') from public.erp_user_profiles p),
 'catalog',(select jsonb_agg(to_jsonb(c) order by key) from public.erp_permission_catalog c),
 'roles',(select jsonb_agg(to_jsonb(r)) from public.erp_role_permissions r),
 'overrides',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from public.erp_user_permission_overrides o)) into v_result;
 return v_result;
end $$;
create function public.pamda_user_save(p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_data->>'user_id')::uuid; v_permission record;
begin
 if not public.pamda_is_admin() then raise exception 'Administração de usuários restrita ao administrador' using errcode='42501'; end if;
 if p_data->>'role' not in ('admin_gerencial','venda_atendimento','financeiro','producao','estoque_expedicao') or
 coalesce(length(btrim(p_data->>'display_name')),0)=0 or p_data->>'active' is null then raise exception 'Perfil inválido'; end if;
 if v_user=auth.uid() and (p_data->>'role'<>'admin_gerencial' or not (p_data->>'active')::boolean) then raise exception 'Não remova o próprio acesso administrativo'; end if;
 update public.erp_user_profiles set display_name=btrim(p_data->>'display_name'),role=p_data->>'role',active=(p_data->>'active')::boolean,
 can_view_financial_metrics=coalesce((p_data->>'can_view_financial_metrics')::boolean,false),updated_at=now() where user_id=v_user;
 if not found then raise exception 'Perfil inexistente'; end if;
 if jsonb_typeof(p_data->'permissions') is distinct from 'object' then raise exception 'Permissões inválidas'; end if;
 for v_permission in select key,value from jsonb_each(p_data->'permissions') loop
 if not exists(select 1 from public.erp_permission_catalog where key=v_permission.key) or jsonb_typeof(v_permission.value)<>'boolean' then raise exception 'Permissão inválida'; end if;
 insert into public.erp_user_permission_overrides(user_id,permission_key,allowed,reason,assigned_by,updated_at)
 values(v_user,v_permission.key,(v_permission.value::text)::boolean,'Configurado no ERP',auth.uid(),now())
 on conflict(user_id,permission_key) do update set allowed=excluded.allowed,reason=excluded.reason,assigned_by=excluded.assigned_by,updated_at=now();
 end loop;
 insert into public.erp_access_audit(actor_user_id,target_user_id,action,details) values(auth.uid(),v_user,'user.configured',p_data-'password');
end $$;
revoke all on function public.pamda_users_read(),public.pamda_user_save(jsonb) from public,anon;
grant execute on function public.pamda_users_read(),public.pamda_user_save(jsonb) to authenticated;
