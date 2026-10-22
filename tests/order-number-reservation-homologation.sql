-- Executar em BEGIN/ROLLBACK: não deixa vendas ou reservas de homologação.
do $$ declare actor uuid; c uuid; b uuid; k uuid:=gen_random_uuid(); k2 uuid:=gen_random_uuid(); n bigint; n2 bigint; sale uuid; begin
 select user_id into actor from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select cb.customer_id,cb.id into c,b from public.customer_branches cb join public.customers cu on cu.id=cb.customer_id where cb.active and cu.active limit 1;
 n:=public.pamda_prepare_order_number(k);
 if n<>public.pamda_prepare_order_number(k) then raise exception 'Reserva não idempotente';end if;
 n2:=public.pamda_prepare_order_number(k2);
 if n=n2 then raise exception 'Numeração duplicada';end if;
 if exists(select 1 from public.erp_sales where draft_key=k) then raise exception 'Reserva criou venda';end if;
 sale:=public.pamda_iniciar_venda(c,b,k);
 if (select order_number from public.erp_sales where id=sale)<>n then raise exception 'Número alterado';end if;
 if public.pamda_release_order_number(k) then raise exception 'Reserva consumida foi liberada';end if;
 if not public.pamda_release_order_number(k2) then raise exception 'Reserva vazia não liberada';end if;
end $$;
