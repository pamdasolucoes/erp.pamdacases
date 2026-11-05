CREATE OR REPLACE FUNCTION pamda_private.available_customer_code() RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 WITH used AS(SELECT DISTINCT btrim(customer_code)::numeric n FROM public.customers WHERE btrim(customer_code)~'^[0-9]+$' AND length(btrim(customer_code))<=18),
 candidates AS(SELECT 2339::numeric n UNION SELECT n+1 FROM used WHERE n>=2339)
 SELECT min(c.n)::text FROM candidates c WHERE NOT EXISTS(SELECT 1 FROM used u WHERE u.n=c.n);
$$;
CREATE FUNCTION public.pamda_create_customer_contact(p_nome text,p_endereco text,p_numero text,p_bairro text,p_cidade text,p_estado text,p_cep text,p_telefone text DEFAULT '',p_cpf text DEFAULT '',p_cnpj text DEFAULT '',p_email text DEFAULT '')
RETURNS TABLE(cliente_id uuid,matriz_id uuid,codigo text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c record;v_cpf text:=nullif(btrim(p_cpf),'');v_cnpj text:=nullif(btrim(p_cnpj),'');v_email text:=nullif(btrim(p_email),'');
BEGIN
 IF auth.uid() IS NULL OR NOT public.pamda_has_permission('customers.manage') THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';END IF;
 IF v_cpf IS NOT NULL AND (v_cpf!~'^[0-9. /-]+$' OR length(regexp_replace(v_cpf,'[^0-9]','','g'))<>11) THEN RAISE EXCEPTION 'Informe um CPF válido ou deixe o campo vazio';END IF;
 IF v_cnpj IS NOT NULL AND (v_cnpj!~'^[0-9. /-]+$' OR length(regexp_replace(v_cnpj,'[^0-9]','','g'))<>14) THEN RAISE EXCEPTION 'Informe um CNPJ válido ou deixe o campo vazio';END IF;
 IF v_email IS NOT NULL AND (v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(v_email)>254) THEN RAISE EXCEPTION 'Informe um e-mail válido ou deixe o campo vazio';END IF;
 SELECT * INTO c FROM public.pamda_create_customer_auto(p_nome,p_endereco,p_numero,p_bairro,p_cidade,p_estado,p_cep,coalesce(p_telefone,''));
 UPDATE public.customers SET cpf=v_cpf,cnpj=v_cnpj,email=v_email WHERE id=c.cliente_id;
 IF v_cpf IS NOT NULL OR v_cnpj IS NOT NULL OR v_email IS NOT NULL OR coalesce(p_telefone,'')<>'' THEN
 INSERT INTO public.erp_commercial_change_audit(actor_user_id,customer_id,branch_id,action,after_data)
 VALUES(auth.uid(),c.cliente_id,c.matriz_id,'customer.contacts_registered',jsonb_build_object('cpf',v_cpf,'cnpj',v_cnpj,'email',v_email,'phone',coalesce(p_telefone,'')));
 END IF;
 RETURN QUERY SELECT c.cliente_id,c.matriz_id,c.codigo;
END $$;
REVOKE ALL ON FUNCTION public.pamda_create_customer_contact(text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pamda_create_customer_contact(text,text,text,text,text,text,text,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
