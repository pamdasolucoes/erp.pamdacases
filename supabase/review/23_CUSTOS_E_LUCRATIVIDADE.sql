-- Custos aprovados: TPU 2,75; impressão 1,25; gerencial TPU personalizada 5,00.
-- Preserva custos específicos de capas especiais e registra todas as correções.
alter table public.erp_sale_items add column direct_unit_cost_snapshot numeric;
comment on column public.erp_sale_items.unit_cost_snapshot is 'Custo de apuração congelado na confirmação: gerencial, quando cadastrado; senão direto.';
comment on column public.erp_sale_items.direct_unit_cost_snapshot is 'Custo direto de produção congelado na confirmação, sem reserva gerencial.';

do $migration$
declare definition text; expected text;
begin
 select pg_get_functiondef('public.pamda_finalize_sale(uuid,jsonb,uuid)'::regprocedure) into definition;
 expected:='select si.*,pr.type,pr.current_cost,pr.controls_inventory,pr.stock_verified';
 if position(expected in definition)=0 then raise exception 'Consulta de custos divergente';end if;
 definition:=replace(definition,expected,'select si.*,pr.type,pr.current_cost,pr.managerial_cost,pr.controls_inventory,pr.stock_verified');
 expected:='update public.erp_sale_items set unit_cost_snapshot=v_cost,cost_verified=(v_cost is not null) where id=i.id;';
 if position(expected in definition)=0 then raise exception 'Gravação de custos divergente';end if;
 definition:=replace(definition,expected,'update public.erp_sale_items set direct_unit_cost_snapshot=v_cost,unit_cost_snapshot=coalesce(i.managerial_cost,v_cost),cost_verified=(coalesce(i.managerial_cost,v_cost) is not null) where id=i.id;');
 execute definition;
end $migration$;

create temporary table pamda_cost_correction on commit drop as
select p.id,p.current_cost old_direct,p.managerial_cost old_managerial,
 case when p.name like 'Capa TPU transparente - %' and p.type='fisico' then 2.75
      when p.type='servico' and p.code in ('1','2') then 1.25
      else p.current_cost end new_direct,p.managerial_cost new_managerial
from public.products p where p.type<>'kit';
create unique index on pamda_cost_correction(id);
insert into pamda_cost_correction
select p.id,p.current_cost,p.managerial_cost,
 (select case when count(*)>0 and bool_and(c.new_direct is not null) then sum(k.quantity*c.new_direct) end from public.kit_components k join pamda_cost_correction c on c.id=k.component_product_id where k.kit_product_id=p.id),
 case when p.name like 'Capa personalizada TPU transparente - %' then 5.00 else p.managerial_cost end
from public.products p where p.type='kit';

do $correction$
declare actor uuid;
begin
 select user_id into actor from public.erp_user_profiles where active and role='admin_gerencial' order by user_id limit 1;
 if actor is null then raise exception 'Responsável administrativo necessário para auditar correção';end if;
 insert into public.erp_product_admin_audit(product_id,actor_user_id,action,before_data,after_data,reason)
 select id,actor,'costs.corrected',jsonb_build_object('current_cost',old_direct,'managerial_cost',old_managerial),jsonb_build_object('current_cost',new_direct,'managerial_cost',new_managerial),
 'Correção autorizada pela direção: TPU R$ 2,75, impressão R$ 1,25 e custo gerencial TPU personalizada R$ 5,00; recomposição dos kits. Executado por migração.'
 from pamda_cost_correction where old_direct is distinct from new_direct or old_managerial is distinct from new_managerial;
 update public.products p set current_cost=c.new_direct,managerial_cost=c.new_managerial,updated_at=now() from pamda_cost_correction c
 where p.id=c.id and (p.current_cost is distinct from c.new_direct or p.managerial_cost is distinct from c.new_managerial);
 -- A correção histórica é explícita e auditada; mudanças futuras do catálogo não recalculam vendas passadas.
 insert into public.erp_operations_audit(actor_user_id,action,entity_id,details)
 select actor,'sale.cost_corrected',i.sale_id,jsonb_build_object('item_id',i.id,'product_id',i.product_id,'previous_cost',i.unit_cost_snapshot,'direct_cost',c.new_direct,'managerial_cost',c.new_managerial,'corrected_cost',coalesce(c.new_managerial,c.new_direct),'reason','Correção histórica solicitada pela direção; migração de custos')
 from public.erp_sale_items i join public.erp_sales s on s.id=i.sale_id join pamda_cost_correction c on c.id=i.product_id
 where s.status='confirmed' and not s.is_test and (c.old_direct is distinct from c.new_direct or c.old_managerial is distinct from c.new_managerial or not i.cost_verified);
 update public.erp_sale_items i set direct_unit_cost_snapshot=c.new_direct,unit_cost_snapshot=coalesce(c.new_managerial,c.new_direct),cost_verified=coalesce(c.new_managerial,c.new_direct) is not null
 from public.erp_sales s,pamda_cost_correction c where s.id=i.sale_id and s.status='confirmed' and not s.is_test and c.id=i.product_id
 and (c.old_direct is distinct from c.new_direct or c.old_managerial is distinct from c.new_managerial or not i.cost_verified);
end $correction$;
