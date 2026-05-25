CREATE TABLE IF NOT EXISTS public.os_records (
  id text PRIMARY KEY,
  os_id text,
  date date NOT NULL,
  client_name text NOT NULL,
  embark_point text NOT NULL,
  tons double precision NOT NULL,
  rne double precision,
  status text
);

ALTER TABLE public.os_records ADD COLUMN IF NOT EXISTS os_id text;

CREATE INDEX IF NOT EXISTS idx_os_records_date ON public.os_records(date);
CREATE INDEX IF NOT EXISTS idx_os_records_os_id ON public.os_records(os_id);
CREATE INDEX IF NOT EXISTS idx_os_records_client ON public.os_records(client_name);
CREATE INDEX IF NOT EXISTS idx_os_records_point ON public.os_records(embark_point);

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

