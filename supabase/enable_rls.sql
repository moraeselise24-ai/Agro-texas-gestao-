-- Segurança: habilita RLS nas tabelas públicas usadas pelo backend
-- Sem policies adicionais: anon/authenticated ficam bloqueados nessas tabelas.
-- O backend continua funcionando via SUPABASE_SERVICE_ROLE_KEY, que bypassa RLS.
ALTER TABLE public.os_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_rules ENABLE ROW LEVEL SECURITY;
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
