-- This server-owned context exists only while the authorized edit RPC runs.
create table pamda_private.sale_edit_context(transaction_id bigint not null,sale_id uuid not null,actor uuid not null,primary key(transaction_id,sale_id,actor));
alter table pamda_private.sale_edit_context enable row level security;
revoke all on pamda_private.sale_edit_context from public,anon,authenticated;
do $patch$ declare d text;begin
 select pg_get_functiondef('public.pamda_sale_movement_edit(uuid,jsonb,text,timestamptz,uuid)'::regprocedure) into d;
 d:=replace(d,'perform pamda_private.check_production_items(s.id,p_document->''items'');',E'insert into pamda_private.sale_edit_context(transaction_id,sale_id,actor) values(txid_current(),s.id,auth.uid());\n perform pamda_private.check_production_items(s.id,p_document->''items'');');
 d:=replace(d,'return s.id;',E'delete from pamda_private.sale_edit_context where transaction_id=txid_current() and sale_id=s.id and actor=auth.uid();\n return s.id;');
 if position('insert into pamda_private.sale_edit_context' in d)=0 then raise exception 'Editor de venda incompatível';end if;execute d;
 select pg_get_functiondef('public.pamda_numera_pedido_ao_adicionar_item()'::regprocedure) into d;
 d:=replace(d,'IF v_status<>''draft'' THEN',E'IF v_status=''confirmed'' AND public.pamda_has_permission(''sales.maintain'') AND EXISTS(select 1 from pamda_private.sale_edit_context where transaction_id=txid_current() and sale_id=NEW.sale_id and actor=auth.uid()) THEN RETURN NEW; END IF;\n IF v_status<>''draft'' THEN');
 if position('pamda_private.sale_edit_context' in d)=0 then raise exception 'Proteção de itens incompatível';end if;execute d;
end $patch$;
