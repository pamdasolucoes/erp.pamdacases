DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.pamda_update_customer(uuid,timestamptz,jsonb,jsonb)'::regprocedure) INTO definition;
 IF position('btrim(v_next_branch.state)='''' OR' in definition)=0 THEN RAISE EXCEPTION 'Revisar assinatura da validação'; END IF;
 definition:=replace(definition, 'btrim(v_next_branch.state)='''' OR'||chr(10)||'        btrim(v_next_branch.zip_code)='''' THEN', 'btrim(v_next_branch.state)='''' THEN');
 IF position('btrim(v_next_branch.zip_code)=''''' in definition)>0 THEN RAISE EXCEPTION 'Validação CEP ainda presente'; END IF;
 EXECUTE definition;
END;
$migration$;
