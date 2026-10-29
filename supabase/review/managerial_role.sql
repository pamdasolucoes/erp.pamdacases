ALTER TABLE public.erp_user_profiles DROP CONSTRAINT erp_user_profiles_role_check;
ALTER TABLE public.erp_user_profiles ADD CONSTRAINT erp_user_profiles_role_check CHECK(role IN ('admin_gerencial','gerencial','venda_atendimento','producao','financeiro','estoque_expedicao'));
ALTER TABLE public.erp_role_permissions DROP CONSTRAINT erp_role_permissions_role_check;
ALTER TABLE public.erp_role_permissions ADD CONSTRAINT erp_role_permissions_role_check CHECK(role IN ('admin_gerencial','gerencial','venda_atendimento','producao','financeiro','estoque_expedicao'));
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.pamda_user_save(jsonb)'::regprocedure) INTO definition;
 IF position('''admin_gerencial'',''venda_atendimento''' in definition)=0 THEN RAISE EXCEPTION 'Revisar validação de perfil'; END IF;
 EXECUTE replace(definition,'''admin_gerencial'',''venda_atendimento''','''admin_gerencial'',''gerencial'',''venda_atendimento''');
END;
$migration$;
-- No automatic elevated access: administrators configure permissions per managerial user.
