-- Complemento aprovado: impressão da capa carteira R$ 1,25 por face.
create temporary table pamda_wallet_costs on commit drop as
select id,current_cost old_cost,case code when '3' then 1.25::numeric else 2.50::numeric end new_cost
from public.products where type='servico' and ((code='3' and name='Impressão DTF UV em Capa Carteira - 1 Face') or (code='4' and name='Impressão DTF UV em Capa Carteira - 2 Faces'));
create unique index on pamda_wallet_costs(id);
do $$ begin if (select count(*) from pamda_wallet_costs)<>2 then raise exception 'Serviços carteira divergentes';end if;end $$;
insert into pamda_wallet_costs
select p.id,p.current_cost,(select case when bool_and(coalesce(w.new_cost,c.current_cost) is not null) then sum(k.quantity*coalesce(w.new_cost,c.current_cost)) end
from public.kit_components k join public.products c on c.id=k.component_product_id left join pamda_wallet_costs w on w.id=c.id where k.kit_product_id=p.id)
from public.products p where p.type='kit' and exists(select 1 from public.kit_components k join pamda_wallet_costs w on w.id=k.component_product_id where k.kit_product_id=p.id);
do $correction$
declare actor uuid;
begin
 select user_id into actor from public.erp_user_profiles where active and role='admin_gerencial' order by user_id limit 1;
 if actor is null then raise exception 'Responsável para auditoria não encontrado';end if;
 if exists(select 1 from pamda_wallet_costs where new_cost is null) then raise exception 'Kit carteira ainda sem custo';end if;
 insert into public.erp_product_admin_audit(product_id,actor_user_id,action,before_data,after_data,reason)
 select id,actor,'costs.corrected',jsonb_build_object('current_cost',old_cost),jsonb_build_object('current_cost',new_cost),
 'Direção aprovou impressão de capa carteira a R$ 1,25 por face; recomposição dos kits preservando custo da capa. Executado por migração.'
 from pamda_wallet_costs where old_cost is distinct from new_cost;
 update public.products p set current_cost=w.new_cost,updated_at=now() from pamda_wallet_costs w where p.id=w.id and p.current_cost is distinct from w.new_cost;
 insert into public.erp_operations_audit(actor_user_id,action,entity_id,details)
 select actor,'sale.cost_corrected',i.sale_id,jsonb_build_object('item_id',i.id,'previous_cost',i.unit_cost_snapshot,'corrected_cost',coalesce(p.managerial_cost,w.new_cost),'reason','Custos carteira aprovados pela direção; migração')
 from public.erp_sale_items i join public.erp_sales s on s.id=i.sale_id join pamda_wallet_costs w on w.id=i.product_id join public.products p on p.id=i.product_id
 where s.status='confirmed' and not s.is_test and (w.old_cost is distinct from w.new_cost or not i.cost_verified);
 update public.erp_sale_items i set direct_unit_cost_snapshot=w.new_cost,unit_cost_snapshot=coalesce(p.managerial_cost,w.new_cost),cost_verified=true
 from public.erp_sales s,pamda_wallet_costs w,public.products p where s.id=i.sale_id and s.status='confirmed' and not s.is_test and w.id=i.product_id and p.id=i.product_id
 and (w.old_cost is distinct from w.new_cost or not i.cost_verified);
end $correction$;
