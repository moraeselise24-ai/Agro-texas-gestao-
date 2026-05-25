# InspectCheck · Painel + Bot

Projeto full-stack (React + Express) com dashboard (gráficos/KPIs) e bot de extração do Classific.

## Rodar local
```bash
npm install
npm run dev
```

Painel: http://localhost:5173  
API: http://localhost:3001/api/health

## Alimentar dados
### 1) Demo (desenvolvimento)
```bash
curl -s -X POST http://localhost:3001/api/demo/seed | cat
```

## Banco (Supabase)
- Execute o schema no Supabase: [schema.sql](file:///Users/marcosvinicius202273/Documents/inspectcheck-dashboard/supabase/schema.sql)
- Configure o backend via `.env` (use `.env.example` como base):
  - SUPABASE_URL (URL do projeto, não use o sufixo `/rest/v1/`)
  - SUPABASE_SERVICE_ROLE_KEY (recomendado para o backend)
  - (alternativo) SUPABASE_ANON_KEY

### 2) Importação CSV (via painel)
Tela: Configurações → Importação CSV

### 3) Coleta online (bot Node/Playwright)
Tela: Configurações → Rodar coleta

**Agendamento automático (produção):** com o servidor no ar, a coleta roda às **7h, 10h, 13h, 16h e 19h** (horário de **Cuiabá/MT**), de **3 em 3 horas** entre 7h e 19h. Variáveis: `COLLECT_SCHEDULE_ENABLED`, `COLLECT_SCHEDULE_TZ`, `COLLECT_SCHEDULE_CRON`.

Configure no `.env`:
- CLASSIFIC_USERNAME
- CLASSIFIC_PASSWORD
- CLASSIFIC_OS_LIST_URL
- CLASSIFIC_OS_ROW_SELECTOR
- CLASSIFIC_OS_ID_COL, CLASSIFIC_OS_CLIENT_COL, CLASSIFIC_OS_POINT_COL, CLASSIFIC_OS_EMBARCADOS_COL (total embarcado kg)
- CLASSIFIC_OS_EMBARCADO_HOJE_COL (kg embarcados hoje — use para bater com o Classific)
- (opcional) CLASSIFIC_LAUDOS_TONS_COL (kg por laudo, para histórico)
- CLASSIFIC_LAUDOS_LIST_URL
- CLASSIFIC_LAUDOS_ROW_SELECTOR
- CLASSIFIC_LAUDOS_DATE_COL, CLASSIFIC_LAUDOS_ID_COL, CLASSIFIC_LAUDOS_OS_ID_COL
- (opcional) CLASSIFIC_OS_STATUS_COL, CLASSIFIC_LAUDOS_CLIENT_COL, CLASSIFIC_LAUDOS_STATUS_COL
- (RNE) CLASSIFIC_RNE_LIST_URL, CLASSIFIC_RNE_ROW_SELECTOR, CLASSIFIC_RNE_DATE_COL, CLASSIFIC_RNE_CLASSIFIER_COL, CLASSIFIC_RNE_OS_ID_COL, CLASSIFIC_RNE_CLIENT_COL, CLASSIFIC_RNE_POINT_COL

## Coleta online via Python (opcional)
Script: `scripts/classific_collect.py`

Instalação:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
python -m playwright install chromium
```

Execução (gera CSV e opcionalmente envia para a API):
```bash
export CLASSIFIC_USERNAME="..."
export CLASSIFIC_PASSWORD="..."
export CLASSIFIC_OS_LIST_URL="https://sistema.classific.com.br/os"
export CLASSIFIC_OS_ROW_SELECTOR="table tbody tr"
export CLASSIFIC_OS_ID_COL=0
export CLASSIFIC_OS_DATE_COL=1
export CLASSIFIC_OS_CLIENT_COL=2
export CLASSIFIC_OS_POINT_COL=3
export CLASSIFIC_OS_TONS_COL=4
export CLASSIFIC_OS_RNE_COL=5
export CLASSIFIC_OS_STATUS_COL=6

export CLASSIFIC_OUT_CSV="classific_os.csv"
export DASHBOARD_PUSH=true
export DASHBOARD_API_URL="http://localhost:3001"

python scripts/classific_collect.py
```
