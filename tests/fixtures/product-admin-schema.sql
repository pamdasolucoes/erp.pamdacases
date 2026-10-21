-- Snapshot de estrutura para PGlite isolado; nunca executar em producao.
CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  category text DEFAULT 'Capas'::text NOT NULL,
  brand text DEFAULT 'Pamda'::text NOT NULL,
  model_phone text,
  type text DEFAULT 'fisico'::text NOT NULL,
  current_cost numeric,
  managerial_cost numeric,
  sale_price numeric,
  controls_inventory boolean DEFAULT true NOT NULL,
  current_inventory numeric DEFAULT 0 NOT NULL,
  min_inventory numeric DEFAULT 0 NOT NULL,
  max_inventory numeric,
  stock_verified boolean DEFAULT false NOT NULL,
  image_url text,
  source_tab text,
  active boolean DEFAULT true NOT NULL,
  b2b_site_visible boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.products ADD CONSTRAINT products_code_key UNIQUE (code);
ALTER TABLE public.products ADD CONSTRAINT products_current_cost_check CHECK ((current_cost >= (0)::numeric));
ALTER TABLE public.products ADD CONSTRAINT products_current_inventory_check CHECK ((current_inventory >= (0)::numeric));
ALTER TABLE public.products ADD CONSTRAINT products_managerial_cost_check CHECK ((managerial_cost >= (0)::numeric));
ALTER TABLE public.products ADD CONSTRAINT products_min_inventory_check CHECK ((min_inventory >= (0)::numeric));
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE public.products ADD CONSTRAINT products_sale_price_check CHECK ((sale_price >= (0)::numeric));
ALTER TABLE public.products ADD CONSTRAINT products_sku_key UNIQUE (sku);
ALTER TABLE public.products ADD CONSTRAINT products_type_check CHECK ((type = ANY (ARRAY['fisico'::text, 'servico'::text, 'kit'::text, 'insumo'::text])));
CREATE TABLE public.kit_components (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kit_product_id uuid NOT NULL,
  component_product_id uuid NOT NULL,
  quantity numeric DEFAULT 1 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.kit_components ADD CONSTRAINT kit_components_component_product_id_fkey FOREIGN KEY (component_product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public.kit_components ADD CONSTRAINT kit_components_kit_product_id_fkey FOREIGN KEY (kit_product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public.kit_components ADD CONSTRAINT kit_components_no_self_reference CHECK ((kit_product_id <> component_product_id));
ALTER TABLE public.kit_components ADD CONSTRAINT kit_components_pkey PRIMARY KEY (id);
ALTER TABLE public.kit_components ADD CONSTRAINT kit_components_quantity_check CHECK ((quantity > (0)::numeric));
ALTER TABLE public.kit_components ADD CONSTRAINT kit_components_unique UNIQUE (kit_product_id, component_product_id);
CREATE TABLE public.erp_panda_ia_phone_models (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kit_product_id uuid NOT NULL,
  base_product_id uuid NOT NULL,
  model_label text NOT NULL,
  brand text NOT NULL,
  body_url text,
  mask_url text,
  technical_verified boolean DEFAULT false NOT NULL,
  published boolean DEFAULT false NOT NULL,
  source text DEFAULT 'erp_manual'::text NOT NULL,
  source_reference text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);
ALTER TABLE public.erp_panda_ia_phone_models ADD CONSTRAINT erp_panda_ia_model_published_requirements CHECK (((NOT published) OR (technical_verified AND (body_url IS NOT NULL) AND (mask_url IS NOT NULL))));
ALTER TABLE public.erp_panda_ia_phone_models ADD CONSTRAINT erp_panda_ia_phone_models_base_product_id_fkey FOREIGN KEY (base_product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public.erp_panda_ia_phone_models ADD CONSTRAINT erp_panda_ia_phone_models_body_url_check CHECK (((body_url IS NULL) OR ((body_url ~* '^https://[^[:space:]]+$'::text) AND (length(body_url) <= 2000))));
ALTER TABLE public.erp_panda_ia_phone_models ADD CONSTRAINT erp_panda_ia_phone_models_brand_check CHECK (((length(btrim(brand)) >= 2) AND (length(btrim(brand)) <= 100)));
ALTER TABLE public.erp_panda_ia_phone_models ADD CONSTRAINT erp_panda_ia_phone_models_kit_product_id_fkey FOREIGN KEY (kit_product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public.erp_panda_ia_phone_models ADD CONSTRAINT erp_panda_ia_phone_models_kit_product_id_key UNIQUE (kit_product_id);
ALTER TABLE public.erp_panda_ia_phone_models ADD CONSTRAINT erp_panda_ia_phone_models_mask_url_check CHECK (((mask_url IS NULL) OR ((mask_url ~* '^https://[^[:space:]]+$'::text) AND (length(mask_url) <= 2000))));
ALTER TABLE public.erp_panda_ia_phone_models ADD CONSTRAINT erp_panda_ia_phone_models_model_label_check CHECK (((length(btrim(model_label)) >= 2) AND (length(btrim(model_label)) <= 160)));
ALTER TABLE public.erp_panda_ia_phone_models ADD CONSTRAINT erp_panda_ia_phone_models_pkey PRIMARY KEY (id);
ALTER TABLE public.erp_panda_ia_phone_models ADD CONSTRAINT erp_panda_ia_phone_models_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE TABLE public.erp_product_admin_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.erp_product_admin_audit ADD CONSTRAINT erp_product_admin_audit_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.erp_product_admin_audit ADD CONSTRAINT erp_product_admin_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.erp_product_admin_audit ADD CONSTRAINT erp_product_admin_audit_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
