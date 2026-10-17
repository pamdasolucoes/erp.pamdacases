-- PARA REVISAO. Nao executar automaticamente nem usar supabase db push.
-- Aplicar SOMENTE no projeto existente erp-pamda, antes de testar pamda-auth.
-- Nao modifica customers, customer_branches ou pamda_clientes_importacao.
BEGIN;

CREATE TABLE public.erp_employees (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  auth_email text NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  role text NOT NULL CHECK (role IN ('admin_gerencial', 'venda_atendimento', 'producao')),
  active boolean NOT NULL DEFAULT false,
  can_read_customers boolean NOT NULL DEFAULT false,
  can_view_financial_metrics boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role <> 'producao' OR (NOT can_read_customers AND NOT can_view_financial_metrics))
);
ALTER TABLE public.erp_employees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_employees FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_employees TO service_role;
-- Sem politica SELECT para anon/authenticated. A associacao username/auth_email
-- so e consultada pela Edge Function com credencial de servidor.

CREATE TABLE public.erp_login_attempts (
  username text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1
);
ALTER TABLE public.erp_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_login_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_login_attempts TO service_role;

CREATE FUNCTION public.pamda_take_login_attempt(p_username text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE attempt_count integer;
BEGIN
  IF p_username !~ '^[a-z0-9][a-z0-9._-]{2,39}$' THEN RETURN false; END IF;
  INSERT INTO public.erp_login_attempts AS current_attempt (username) VALUES (p_username)
  ON CONFLICT (username) DO UPDATE SET
    attempts = CASE WHEN current_attempt.window_started_at < now() - interval '15 minutes'
                    THEN 1 ELSE LEAST(current_attempt.attempts + 1, 11) END,
    window_started_at = CASE WHEN current_attempt.window_started_at < now() - interval '15 minutes'
                             THEN now() ELSE current_attempt.window_started_at END
  RETURNING attempts INTO attempt_count;
  RETURN attempt_count <= 10;
END;
$$;
REVOKE ALL ON FUNCTION public.pamda_take_login_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pamda_take_login_attempt(text) TO service_role;

CREATE FUNCTION public.pamda_guard_employee_admin()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  -- Serializa alteracoes de administradores, inclusive requisicoes simultaneas.
  PERFORM pg_advisory_xact_lock(721941, 1);
  IF OLD.active AND OLD.role = 'admin_gerencial' THEN
    IF TG_OP = 'DELETE' OR NOT NEW.active OR NEW.role <> 'admin_gerencial' THEN
      IF NOT EXISTS (SELECT 1 FROM public.erp_employees
                     WHERE id <> OLD.id AND active AND role = 'admin_gerencial') THEN
        RAISE EXCEPTION 'Mantenha pelo menos um administrador ativo.';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pamda_guard_employee_admin() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_pamda_guard_employee_admin
BEFORE UPDATE OR DELETE ON public.erp_employees FOR EACH ROW
EXECUTE FUNCTION public.pamda_guard_employee_admin();

CREATE FUNCTION public.pamda_bootstrap_admin(p_id uuid, p_username text, p_auth_email text, p_display_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(721941, 1);
  IF EXISTS (SELECT 1 FROM public.erp_employees) THEN
    RAISE EXCEPTION 'Bootstrap disponivel somente antes do primeiro funcionario.';
  END IF;
  INSERT INTO public.erp_employees (id, username, auth_email, display_name, role, active,
    can_read_customers, can_view_financial_metrics, must_change_password)
  VALUES (p_id, p_username, p_auth_email, p_display_name, 'admin_gerencial', true, true, true, true);
END;
$$;
REVOKE ALL ON FUNCTION public.pamda_bootstrap_admin(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pamda_bootstrap_admin(uuid, text, text, text) TO service_role;

-- Usada pela RLS da etapa seguinte. Nao confia em roles ou claims fornecidos
-- pelo navegador; mudancas de perfil e inativacao refletem na proxima consulta.
CREATE FUNCTION public.pamda_employee_session_valid(p_employee_id uuid, p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM auth.sessions s
                 WHERE s.id = p_session_id AND s.user_id = p_employee_id);
$$;
REVOKE ALL ON FUNCTION public.pamda_employee_session_valid(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pamda_employee_session_valid(uuid, uuid) TO service_role;

CREATE FUNCTION public.pamda_can_read_customers()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.erp_employees e
    WHERE e.id = (SELECT auth.uid()) AND e.active AND NOT e.must_change_password
      AND e.role IN ('admin_gerencial', 'venda_atendimento') AND e.can_read_customers
      AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = e.id
                  AND s.id = ((SELECT auth.jwt()) ->> 'session_id')::uuid)
  );
$$;
REVOKE ALL ON FUNCTION public.pamda_can_read_customers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pamda_can_read_customers() TO authenticated, service_role;

COMMIT;
