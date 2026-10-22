create function public.pamda_real_sale_document(p_sale_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.erp_sales s where s.id=p_sale_id and s.status='confirmed' and not s.is_test and
 (public.pamda_has_permission('sales.read') or (s.created_by=auth.uid() and public.pamda_has_permission('sales.draft')))) then raise exception 'Acesso negado ao documento' using errcode='42501'; end if;
 select to_jsonb(r)||jsonb_build_object('paid',v.paid) into v_result from public.erp_sale_receipts r join public.erp_receivables v on v.sale_id=r.sale_id where r.sale_id=p_sale_id;
 if v_result is null then raise exception 'Recibo não encontrado'; end if;
 return v_result;
end $$;
revoke all on function public.pamda_real_sale_document(uuid) from public,anon;
grant execute on function public.pamda_real_sale_document(uuid) to authenticated;
