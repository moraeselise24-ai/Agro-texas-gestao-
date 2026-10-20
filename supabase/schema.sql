CREATE TABLE IF NOT EXISTS public.os_records (
  id text PRIMARY KEY,
  os_id text,
  contract_number text,
  date date NOT NULL,
  client_name text NOT NULL,
  embark_point text NOT NULL,
  classifier_name text,
  plate text,
  tons double precision NOT NULL,
  rne double precision,
  status text
);

ALTER TABLE public.os_records ADD COLUMN IF NOT EXISTS os_id text;
ALTER TABLE public.os_records ADD COLUMN IF NOT EXISTS contract_number text;
ALTER TABLE public.os_records ADD COLUMN IF NOT EXISTS classifier_name text;
ALTER TABLE public.os_records ADD COLUMN IF NOT EXISTS plate text;

CREATE INDEX IF NOT EXISTS idx_os_records_date ON public.os_records(date);
CREATE INDEX IF NOT EXISTS idx_os_records_os_id ON public.os_records(os_id);
CREATE INDEX IF NOT EXISTS idx_os_records_contract ON public.os_records(contract_number);
CREATE INDEX IF NOT EXISTS idx_os_records_plate ON public.os_records(plate);
CREATE INDEX IF NOT EXISTS idx_os_records_client ON public.os_records(client_name);
CREATE INDEX IF NOT EXISTS idx_os_records_point ON public.os_records(embark_point);
CREATE INDEX IF NOT EXISTS idx_os_records_classifier ON public.os_records(classifier_name);

CREATE TABLE IF NOT EXISTS public.billing_rules (
  id integer PRIMARY KEY,
  daily_fee_brl double precision NOT NULL,
  base_tariff_brl_per_ton double precision NOT NULL,
  min_cadence_tons double precision NOT NULL,
  excess_multiplier double precision NOT NULL
);

INSERT INTO public.billing_rules (id, daily_fee_brl, base_tariff_brl_per_ton, min_cadence_tons, excess_multiplier)
VALUES (1, 400, 2, 200, 2)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.classifier_daily_rates (
  classifier_name text PRIMARY KEY,
  daily_rate_brl double precision NOT NULL CHECK (daily_rate_brl > 0),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.classifier_payment_entries (
  id text PRIMARY KEY,
  classifier_name text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  amount_brl double precision NOT NULL CHECK (amount_brl > 0),
  paid_at date NOT NULL,
  type text NOT NULL CHECK (type IN ('pagamento', 'adiantamento')),
  notes text,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz DEFAULT now(),
  CHECK (period_from <= period_to)
);

CREATE INDEX IF NOT EXISTS idx_classifier_payment_entries_period ON public.classifier_payment_entries(period_from, period_to);
CREATE INDEX IF NOT EXISTS idx_classifier_payment_entries_classifier ON public.classifier_payment_entries(classifier_name);

-- Perfis de usuário (1:1 com auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text DEFAULT 'operador',
  can_access_dashboard boolean DEFAULT false,
  can_access_faturamento boolean DEFAULT false,
  can_access_expense_dashboard boolean DEFAULT false,
  can_access_reports boolean DEFAULT false,
  can_access_programacao boolean DEFAULT false,
  can_access_financeiro boolean DEFAULT false,
  can_access_iris boolean DEFAULT false,
  can_manage_users boolean DEFAULT false,
  can_manage_config boolean DEFAULT false,
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_can_access_dashboard ON public.profiles(can_access_dashboard);
CREATE INDEX IF NOT EXISTS idx_profiles_can_access_faturamento ON public.profiles(can_access_faturamento);
CREATE INDEX IF NOT EXISTS idx_profiles_can_access_expense_dashboard ON public.profiles(can_access_expense_dashboard);
CREATE INDEX IF NOT EXISTS idx_profiles_can_access_reports ON public.profiles(can_access_reports);
CREATE INDEX IF NOT EXISTS idx_profiles_can_access_programacao ON public.profiles(can_access_programacao);
CREATE INDEX IF NOT EXISTS idx_profiles_can_access_financeiro ON public.profiles(can_access_financeiro);
CREATE INDEX IF NOT EXISTS idx_profiles_can_access_iris ON public.profiles(can_access_iris);
CREATE INDEX IF NOT EXISTS idx_profiles_can_manage_users ON public.profiles(can_manage_users);
CREATE INDEX IF NOT EXISTS idx_profiles_can_manage_config ON public.profiles(can_manage_config);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_access_faturamento boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_iris boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    can_access_dashboard,
    can_access_faturamento,
    can_access_expense_dashboard,
    can_access_reports,
    can_access_programacao,
    can_access_financeiro,
    can_access_iris,
    can_manage_users,
    can_manage_config
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operador'),
    COALESCE((NEW.raw_user_meta_data->>'can_access_dashboard')::boolean, false),
    COALESCE((NEW.raw_user_meta_data->>'can_access_faturamento')::boolean, false),
    COALESCE((NEW.raw_user_meta_data->>'can_access_expense_dashboard')::boolean, false),
    COALESCE((NEW.raw_user_meta_data->>'can_access_reports')::boolean, false),
    COALESCE((NEW.raw_user_meta_data->>'can_access_programacao')::boolean, false),
    COALESCE((NEW.raw_user_meta_data->>'can_access_financeiro')::boolean, false),
    COALESCE((NEW.raw_user_meta_data->>'can_access_iris')::boolean, false),
    COALESCE((NEW.raw_user_meta_data->>'can_manage_users')::boolean, false),
    COALESCE((NEW.raw_user_meta_data->>'can_manage_config')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles: select próprio" ON public.profiles;
CREATE POLICY "Profiles: select próprio"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: update próprio" ON public.profiles;
CREATE POLICY "Profiles: update próprio"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Nova conversa',
  range_from date,
  range_to date,
  ai_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operation_assets (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  brand text,
  model text,
  serial_number text,
  location text,
  responsible_name text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'manutencao', 'emprestado', 'baixado', 'vendido', 'perdido')),
  condition text NOT NULL DEFAULT 'bom' CHECK (condition IN ('novo', 'bom', 'regular', 'critico')),
  acquisition_date date,
  acquisition_value_brl numeric(14,2) NOT NULL DEFAULT 0,
  useful_life_months integer,
  warranty_until date,
  next_maintenance_date date,
  disposal_date date,
  disposal_reason text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operation_assets_status ON public.operation_assets(status);
CREATE INDEX IF NOT EXISTS idx_operation_assets_category ON public.operation_assets(category);
CREATE INDEX IF NOT EXISTS idx_operation_assets_location ON public.operation_assets(location);
CREATE INDEX IF NOT EXISTS idx_operation_assets_responsible ON public.operation_assets(responsible_name);
CREATE INDEX IF NOT EXISTS idx_operation_assets_next_maintenance ON public.operation_assets(next_maintenance_date);

CREATE TABLE IF NOT EXISTS public.operation_asset_options (
  id text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('category', 'brand', 'model')),
  name text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (type, name)
);

CREATE INDEX IF NOT EXISTS idx_operation_asset_options_type ON public.operation_asset_options(type);
CREATE INDEX IF NOT EXISTS idx_operation_asset_options_active ON public.operation_asset_options(active);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_id ON public.assistant_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_updated_at ON public.assistant_conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation_id ON public.assistant_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_created_at ON public.assistant_messages(created_at);

CREATE TABLE IF NOT EXISTS public.classificadores (
  id text PRIMARY KEY,
  nome text NOT NULL,
  email text,
  whatsapp text,
  municipio text,
  uf text,
  status text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classificadores_nome ON public.classificadores(nome);

CREATE TABLE IF NOT EXISTS public.programacoes (
  id text PRIMARY KEY,
  data date NOT NULL UNIQUE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  import_source_date date,
  import_reference text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.programacoes ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.programacoes ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE public.programacoes ADD COLUMN IF NOT EXISTS import_source_date date;
ALTER TABLE public.programacoes ADD COLUMN IF NOT EXISTS import_reference text;

CREATE INDEX IF NOT EXISTS idx_programacoes_data ON public.programacoes(data);

CREATE TABLE IF NOT EXISTS public.programacao_itens (
  id text PRIMARY KEY,
  programacao_id text NOT NULL REFERENCES public.programacoes(id) ON DELETE CASCADE,
  classificador_id text,
  classificador_nome text NOT NULL,
  cliente text,
  local_embarque text NOT NULL,
  os_id text NOT NULL,
  destino text,
  fazenda_armazem text,
  volume_remanescente double precision,
  volume_embarcado double precision,
  volume_os double precision,
  produto text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.programacao_itens ADD COLUMN IF NOT EXISTS volume_embarcado double precision;
ALTER TABLE public.programacao_itens ADD COLUMN IF NOT EXISTS cliente text;

CREATE INDEX IF NOT EXISTS idx_programacao_itens_programacao_id ON public.programacao_itens(programacao_id);

CREATE TABLE IF NOT EXISTS public.operation_service_order_drafts (
  id text PRIMARY KEY,
  reference_code text NOT NULL UNIQUE,
  requested_date date NOT NULL,
  client_name text NOT NULL,
  embark_point text NOT NULL,
  embark_point_municipio text,
  embark_point_uf text,
  embark_point_needs_create boolean DEFAULT false,
  destination text NOT NULL,
  destination_municipio text,
  destination_uf text,
  destination_needs_create boolean DEFAULT false,
  product text NOT NULL,
  contract_number text,
  lot_kg double precision NOT NULL DEFAULT 0,
  classifier_name text,
  producer_name text,
  notes text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (
    status IN ('rascunho', 'pendente_envio', 'enviando', 'criada', 'erro', 'cancelada')
  ),
  classific_os_id text,
  bot_error text,
  sent_at timestamptz,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS reference_code text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS requested_date date;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS embark_point text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS embark_point_municipio text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS embark_point_uf text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS embark_point_needs_create boolean DEFAULT false;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS destination text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS destination_municipio text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS destination_uf text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS destination_needs_create boolean DEFAULT false;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS product text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS contract_number text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS lot_kg double precision DEFAULT 0;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS classifier_name text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS producer_name text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS status text DEFAULT 'rascunho';
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS classific_os_id text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS bot_error text;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.operation_service_order_drafts ADD COLUMN IF NOT EXISTS created_by_name text;

CREATE INDEX IF NOT EXISTS idx_operation_service_order_drafts_requested_date ON public.operation_service_order_drafts(requested_date);
CREATE INDEX IF NOT EXISTS idx_operation_service_order_drafts_status ON public.operation_service_order_drafts(status);

CREATE TABLE IF NOT EXISTS public.operation_service_order_options (
  id text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('client', 'embark', 'destination', 'product')),
  name text NOT NULL,
  municipio text,
  uf text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (type, name)
);

CREATE INDEX IF NOT EXISTS idx_operation_service_order_options_type ON public.operation_service_order_options(type);
CREATE INDEX IF NOT EXISTS idx_operation_service_order_options_active ON public.operation_service_order_options(active);

CREATE TABLE IF NOT EXISTS public.operation_expense_categories (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.operation_expense_categories (id, name, active)
VALUES
  ('funcionarios', 'Funcionários', true),
  ('restaurantes', 'Restaurantes', true),
  ('hospedagem', 'Hospedagem', true),
  ('combustiveis', 'Combustíveis', true),
  ('contador', 'Contador', true),
  ('frota', 'Frota', true),
  ('convenios', 'Convênios', true),
  ('outros', 'Outros', true)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_operation_expense_categories_name ON public.operation_expense_categories(name);

CREATE TABLE IF NOT EXISTS public.operation_expenses (
  id text PRIMARY KEY,
  date date NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  supplier text,
  amount_brl double precision NOT NULL CHECK (amount_brl > 0),
  payment_method text,
  document_number text,
  due_date date,
  scheduled_payment_date date,
  paid_at date,
  status text NOT NULL DEFAULT 'a_pagar' CHECK (status IN ('agendada', 'a_pagar', 'paga', 'cancelada')),
  is_recurring boolean DEFAULT false,
  recurrence_frequency text CHECK (recurrence_frequency IS NULL OR recurrence_frequency IN ('semanal', 'mensal', 'anual')),
  recurrence_until date,
  notes text,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.operation_expenses ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.operation_expenses ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_operation_expenses_source_key ON public.operation_expenses(source_key);
ALTER TABLE public.operation_expenses ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.operation_expenses ADD COLUMN IF NOT EXISTS scheduled_payment_date date;
ALTER TABLE public.operation_expenses ADD COLUMN IF NOT EXISTS paid_at date;
ALTER TABLE public.operation_expenses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'a_pagar';
ALTER TABLE public.operation_expenses ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;
ALTER TABLE public.operation_expenses ADD COLUMN IF NOT EXISTS recurrence_frequency text;
ALTER TABLE public.operation_expenses ADD COLUMN IF NOT EXISTS recurrence_until date;

CREATE INDEX IF NOT EXISTS idx_operation_expenses_date ON public.operation_expenses(date);
CREATE INDEX IF NOT EXISTS idx_operation_expenses_category ON public.operation_expenses(category);
CREATE INDEX IF NOT EXISTS idx_operation_expenses_due_date ON public.operation_expenses(due_date);
CREATE INDEX IF NOT EXISTS idx_operation_expenses_status ON public.operation_expenses(status);

CREATE TABLE IF NOT EXISTS public.operation_revenue_categories (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.operation_revenue_categories (id, name, active)
VALUES
  ('faturamento-operacional', 'Faturamento operacional', true),
  ('receita-manual', 'Receita manual', true),
  ('reembolso', 'Reembolso', true),
  ('servico-extra', 'Serviço extra', true),
  ('contrato-mensal', 'Contrato mensal', true),
  ('outros', 'Outros', true)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_operation_revenue_categories_name ON public.operation_revenue_categories(name);

CREATE TABLE IF NOT EXISTS public.operation_revenues (
  id text PRIMARY KEY,
  date date NOT NULL,
  category text NOT NULL,
  client_name text,
  description text NOT NULL,
  amount_brl double precision NOT NULL CHECK (amount_brl > 0),
  payment_method text,
  document_number text,
  due_date date,
  expected_receipt_date date,
  received_at date,
  status text NOT NULL DEFAULT 'a_receber' CHECK (status IN ('prevista', 'a_receber', 'recebida', 'cancelada')),
  is_recurring boolean DEFAULT false,
  recurrence_frequency text CHECK (recurrence_frequency IS NULL OR recurrence_frequency IN ('semanal', 'mensal', 'anual')),
  recurrence_until date,
  notes text,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.operation_revenues ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.operation_revenues ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.operation_revenues ADD COLUMN IF NOT EXISTS expected_receipt_date date;
ALTER TABLE public.operation_revenues ADD COLUMN IF NOT EXISTS received_at date;
ALTER TABLE public.operation_revenues ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'a_receber';
ALTER TABLE public.operation_revenues ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;
ALTER TABLE public.operation_revenues ADD COLUMN IF NOT EXISTS recurrence_frequency text;
ALTER TABLE public.operation_revenues ADD COLUMN IF NOT EXISTS recurrence_until date;

CREATE INDEX IF NOT EXISTS idx_operation_revenues_date ON public.operation_revenues(date);
CREATE INDEX IF NOT EXISTS idx_operation_revenues_category ON public.operation_revenues(category);
CREATE INDEX IF NOT EXISTS idx_operation_revenues_due_date ON public.operation_revenues(due_date);
CREATE INDEX IF NOT EXISTS idx_operation_revenues_expected_receipt_date ON public.operation_revenues(expected_receipt_date);
CREATE INDEX IF NOT EXISTS idx_operation_revenues_received_at ON public.operation_revenues(received_at);
CREATE INDEX IF NOT EXISTS idx_operation_revenues_status ON public.operation_revenues(status);

-- Segurança: habilita RLS nas tabelas públicas usadas pelo backend
-- Sem policies adicionais: anon/authenticated ficam bloqueados nessas tabelas.
-- O backend continua funcionando via SUPABASE_SERVICE_ROLE_KEY, que bypassa RLS.
ALTER TABLE public.os_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classifier_daily_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classifier_payment_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_asset_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classificadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_service_order_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_service_order_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_revenue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_revenues ENABLE ROW LEVEL SECURITY;
