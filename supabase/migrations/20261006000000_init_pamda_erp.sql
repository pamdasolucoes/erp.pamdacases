-- ======================================================================
-- PAMDA CASES ERP B2B - SCHEMA E MIGRATION INICIAL POSTGRESQL / SUPABASE
-- Versão: 1.0.0
-- ======================================================================

-- 1. Extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Sequência oficial para número de recibo iniciando em 10000
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq
  START WITH 10000
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- 3. Tipos e Enums
DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM ('admin_gerencial', 'venda_atendimento', 'producao');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE product_type_enum AS ENUM ('fisico', 'servico', 'kit', 'insumo');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE sale_status_enum AS ENUM ('orcamento', 'confirmada', 'cancelada');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE financial_status_enum AS ENUM (
    'aguardando_pagamento',
    'parcialmente_pago',
    'pago',
    'faturamento_semanal',
    'faturamento_mensal',
    'vencido',
    'cancelado'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE production_status_enum AS ENUM (
    'aguardando_liberacao',
    'aguardando_producao',
    'em_producao',
    'conferencia',
    'pronto',
    'entregue'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status_enum AS ENUM (
    'nao_definido',
    'retirada',
    'aguardando_entrega',
    'saiu_para_entrega',
    'entregue'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Tabela de Configurações do Sistema
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name VARCHAR(255) NOT NULL DEFAULT 'PAMDA CASES',
  trade_name VARCHAR(255) NOT NULL DEFAULT 'Pamda Cases B2B',
  cnpj VARCHAR(20) DEFAULT '12.345.678/0001-90',
  phone VARCHAR(50) DEFAULT '(41) 99999-8888',
  pix_key VARCHAR(100) NOT NULL DEFAULT 'capaspix@gmail.com',
  pix_key_type VARCHAR(20) NOT NULL DEFAULT 'email',
  pix_beneficiary_name VARCHAR(255) NOT NULL DEFAULT 'PAMDA CASES IND E COM',
  receipt_initial_number INT NOT NULL DEFAULT 10000,
  default_delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 5.00,
  site_integration_webhook_secret TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Tabela de Usuários Administrativos
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  role user_role_enum NOT NULL DEFAULT 'venda_atendimento',
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Tabela de Clientes / Redes
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  company_name VARCHAR(200),
  cnpj VARCHAR(25),
  cpf VARCHAR(20),
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(150),
  contact_name VARCHAR(100) NOT NULL,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  is_chain BOOLEAN NOT NULL DEFAULT false,
  billing_mode VARCHAR(20) NOT NULL DEFAULT 'consolidado', -- 'consolidado' | 'separado'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Tabela de Políticas de Pagamento do Cliente
CREATE TABLE IF NOT EXISTS customer_payment_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  policy_type VARCHAR(50) NOT NULL DEFAULT 'pagamento_entrega',
  produce_only_after_payment BOOLEAN NOT NULL DEFAULT false,
  closing_frequency VARCHAR(20) NOT NULL DEFAULT 'none', -- 'none', 'weekly', 'monthly', 'custom'
  closing_day INT DEFAULT 5,
  payment_term_days INT NOT NULL DEFAULT 0,
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  allow_new_orders_with_overdue BOOLEAN NOT NULL DEFAULT false,
  auto_block_on_overdue BOOLEAN NOT NULL DEFAULT true,
  financial_notes TEXT,
  show_pix_on_pending_receipts BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_customer_policy UNIQUE (customer_id)
);

-- 8. Tabela de Filiais
CREATE TABLE IF NOT EXISTS customer_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  trade_name VARCHAR(150),
  address VARCHAR(200) NOT NULL,
  number VARCHAR(20),
  complement VARCHAR(50),
  neighborhood VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  zip_code VARCHAR(15) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  override_policy JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Tabela de Categorias
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true
);

-- 10. Tabela de Produtos
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'Capas',
  brand VARCHAR(100) NOT NULL DEFAULT 'Pamda',
  model_phone VARCHAR(100),
  type product_type_enum NOT NULL DEFAULT 'fisico',
  current_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  managerial_cost NUMERIC(10,2) DEFAULT NULL,
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  controls_inventory BOOLEAN NOT NULL DEFAULT true,
  current_inventory NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  min_inventory NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  max_inventory NUMERIC(10,2) DEFAULT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  b2b_site_visible BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Tabela de Componentes de Kits
CREATE TABLE IF NOT EXISTS kit_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kit_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Histórico de Custos do Produto (imutabilidade histórica)
CREATE TABLE IF NOT EXISTS product_cost_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cost NUMERIC(10,2) NOT NULL,
  recorded_by VARCHAR(50) NOT NULL,
  reason TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Movimentações de Estoque
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_code VARCHAR(50) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  previous_inventory NUMERIC(10,2) NOT NULL,
  resulting_inventory NUMERIC(10,2) NOT NULL,
  movement_type VARCHAR(50) NOT NULL,
  username VARCHAR(50) NOT NULL,
  related_sale_id UUID,
  related_receipt_number INT,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Tabela de Vendas
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_number INT NOT NULL UNIQUE DEFAULT nextval('receipt_number_seq'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name VARCHAR(150) NOT NULL,
  branch_id UUID REFERENCES customer_branches(id) ON DELETE SET NULL,
  branch_name VARCHAR(150),
  branch_address_snapshot TEXT,
  salesperson_name VARCHAR(100) NOT NULL,
  origin VARCHAR(50) NOT NULL DEFAULT 'erp_manual',
  sale_status sale_status_enum NOT NULL DEFAULT 'confirmada',
  financial_status financial_status_enum NOT NULL DEFAULT 'aguardando_pagamento',
  production_status production_status_enum NOT NULL DEFAULT 'aguardando_liberacao',
  delivery_status delivery_status_enum NOT NULL DEFAULT 'nao_definido',
  
  -- Totais e Valores Financeiros (numeric preciso)
  items_count INT NOT NULL DEFAULT 0,
  products_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  shipping_fee_charged NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  real_delivery_cost NUMERIC(10,2) DEFAULT 0.00,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  
  -- Snapshot da política no momento da venda
  payment_policy_snapshot JSONB NOT NULL,
  notes TEXT,
  
  -- Controle de Pagamento
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  pending_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  due_date DATE NOT NULL,
  
  production_started_at TIMESTAMPTZ,
  production_finished_at TIMESTAMPTZ,
  created_by_user VARCHAR(50) NOT NULL
);

-- 15. Itens da Venda (com snapshots de custos)
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_code VARCHAR(50) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  sku VARCHAR(50) NOT NULL,
  product_type product_type_enum NOT NULL,
  unit VARCHAR(10) NOT NULL DEFAULT 'UN',
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  unit_discount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  subtotal NUMERIC(12,2) NOT NULL,
  
  -- CRÍTICO: Snapshot histórico de custo
  unit_cost_snapshot NUMERIC(10,2) NOT NULL,
  managerial_unit_cost_snapshot NUMERIC(10,2) NOT NULL,
  components_snapshot JSONB
);

-- 16. Pagamentos
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  receipt_number INT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name VARCHAR(150) NOT NULL,
  branch_id UUID,
  amount NUMERIC(12,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  origin VARCHAR(50) NOT NULL DEFAULT 'sistema',
  external_payment_id VARCHAR(100),
  webhook_event_id VARCHAR(100),
  notes TEXT,
  recorded_by_username VARCHAR(50) NOT NULL
);

-- 17. Fechamentos Semanais / Mensais
CREATE TABLE IF NOT EXISTS billing_closings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name VARCHAR(150) NOT NULL,
  branch_id UUID,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  sales_ids JSONB NOT NULL,
  receipt_numbers JSONB NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  pending_balance NUMERIC(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'aberto',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by VARCHAR(50) NOT NULL
);

-- 18. Fornecedores e Compras
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(150),
  cnpj VARCHAR(25),
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_name VARCHAR(150) NOT NULL,
  purchase_date DATE NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  notes TEXT,
  created_by_user VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name VARCHAR(200) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  unit_cost NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  update_product_current_cost BOOLEAN NOT NULL DEFAULT true
);

-- 19. Despesas Operacionais
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  description VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_by_user VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. Auditoria e Logs Administrativos
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  username VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id VARCHAR(50) NOT NULL,
  diff JSONB
);

-- 21. Índices para performance e consultas frequentes
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_receipt ON sales(receipt_number);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_production_status ON sales(production_status);
CREATE INDEX IF NOT EXISTS idx_sales_financial_status ON sales(financial_status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_branches_customer ON customer_branches(customer_id);
CREATE INDEX IF NOT EXISTS idx_kit_components_kit ON kit_components(kit_product_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

-- ======================================================================
-- SEGURANÇA E ROW LEVEL SECURITY (RLS)
-- ======================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de exemplo para Supabase Auth:
CREATE POLICY "Leitura autenticada para produtos"
  ON products FOR SELECT
  USING (true);

CREATE POLICY "Somente gerencial altera custos e produtos"
  ON product_cost_history FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin_gerencial'
    )
  );
