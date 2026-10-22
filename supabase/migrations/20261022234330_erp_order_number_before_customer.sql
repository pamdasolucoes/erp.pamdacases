-- Reserva o número ao abrir a tela, sem criar venda com cliente fictício.
create table pamda_private.order_number_reservations (
 draft_key uuid primary key, actor_user_id uuid not null references auth.users(id),
 order_number bigint not null unique check(order_number>=10000), created_at timestamptz not null default now()
);
create index on pamda_private.order_number_reservations(actor_user_id);
alter table pamda_private.order_number_reservations enable row level security;
revoke all on pamda_private.order_number_reservations from public,anon,authenticated;

create function pamda_private.release_order_reservation(p_key uuid,p_actor uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n bigint;
begin
 delete from pamda_private.order_number_reservations where draft_key=p_key and actor_user_id=p_actor returning order_number into n;
 if n is null then return false;end if;
 insert into public.erp_reusable_order_numbers(order_number) values(n) on conflict(order_number) do nothing;
 return true;
end $$;

create function public.pamda_prepare_order_number(p_draft_key uuid,p_previous_key uuid default null) returns bigint
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); n bigint;
begin
 perform pamda_private.require_permission('sales.draft');
 if p_draft_key is null then raise exception 'Chave da nova venda obrigatória';end if;
 perform pg_advisory_xact_lock(hashtextextended('order-reservation:'||actor::text,0));
 if p_previous_key is not null and p_previous_key<>p_draft_key then perform pamda_private.release_order_reservation(p_previous_key,actor);end if;
 select order_number into n from public.erp_sales where created_by=actor and draft_key=p_draft_key;
 if n is not null then return n;end if;
 select order_number into n from pamda_private.order_number_reservations where draft_key=p_draft_key and actor_user_id=actor;
 if n is not null then return n;end if;
 n:=public.pamda_reservar_numero_pedido();
 insert into pamda_private.order_number_reservations(draft_key,actor_user_id,order_number) values(p_draft_key,actor,n);
 return n;
end $$;

create function public.pamda_release_order_number(p_draft_key uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 perform pamda_private.require_permission('sales.draft');
 if p_draft_key is null then raise exception 'Chave obrigatória';end if;
 perform pg_advisory_xact_lock(hashtextextended('order-reservation:'||actor::text,0));
 return pamda_private.release_order_reservation(p_draft_key,actor);
end $$;

create function pamda_private.use_order_reservation() returns trigger
language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 if new.status='draft' and new.order_number is null then
  delete from pamda_private.order_number_reservations where draft_key=new.draft_key and actor_user_id=new.created_by returning order_number into n;
  if n is not null then new.order_number:=n;end if;
 end if;
 return new;
end $$;
create trigger erp_use_prepared_order_number before insert on public.erp_sales
for each row execute function pamda_private.use_order_reservation();

revoke all on function public.pamda_prepare_order_number(uuid,uuid),public.pamda_release_order_number(uuid) from public,anon;
grant execute on function public.pamda_prepare_order_number(uuid,uuid),public.pamda_release_order_number(uuid) to authenticated;
