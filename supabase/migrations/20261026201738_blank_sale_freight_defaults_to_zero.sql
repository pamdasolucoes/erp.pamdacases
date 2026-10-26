-- Blank freight is zero, including clients without a configured default.
do $$ declare d text; begin
 select pg_get_functiondef('public.pamda_salvar_rascunho_venda(uuid,uuid,jsonb,numeric,numeric,text,text,uuid,uuid,uuid)'::regprocedure) into d;
 if position('v_default_shipping IS DISTINCT FROM p_frete' in d)=0 then raise exception 'Unexpected draft definition'; end if;
 d:=replace(d,E'BEGIN\n',E'BEGIN\n p_frete:=coalesce(p_frete,0);\n');
 d:=replace(d,'v_default_shipping IS DISTINCT FROM p_frete','coalesce(v_default_shipping,0) IS DISTINCT FROM p_frete');
 execute d;
 select pg_get_functiondef('public.pamda_iniciar_venda(uuid,uuid,uuid)'::regprocedure) into d;
 if position('v_freight IS NOT NULL' in d)=0 then raise exception 'Unexpected sale creation definition'; end if;
 d:=replace(d,'v_freight IS NOT NULL','true');
 execute d;
end $$;
