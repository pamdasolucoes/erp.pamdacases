-- Referência opcional na finalização; mantém autorização financeira e demais validações.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pamda_finalize_sale(uuid,jsonb,uuid)'::regprocedure) into definition;
 if position('if coalesce(length(btrim(p->>''reference'')),0)<3 then raise exception ''Informe a referência do recebimento''; end if;' in definition)=0 then raise exception 'Definição da finalização divergente';end if;
 definition:=replace(definition,'if coalesce(length(btrim(p->>''reference'')),0)<3 then raise exception ''Informe a referência do recebimento''; end if;','-- Referência opcional: recebimento conferido pelo operador.');
 execute definition;
end $migration$;
