# Robô local e painel Netlify

## Fluxo

O macOS executa o coletor do Classific e grava os dados no Supabase. O painel e a API ficam publicados no Netlify e leem o mesmo banco. A máquina local nunca precisa receber conexões externas.

## Variáveis locais

No arquivo `.env.local` da pasta do projeto, mantenha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e todas as variáveis `CLASSIFIC_*`. Essas credenciais não vão para o Netlify.

Defina também:

```env
COLLECT_SCHEDULE_ENABLED=false
```

Faça uma coleta manual antes de ativar o agendamento:

```sh
npm run collect:local
```

## Agendamento macOS

O arquivo `deploy/launchd/br.com.inspectcheck.collector.plist` executa uma coleta ao entrar na sessão e às 7h, 10h, 13h, 16h e 19h. Se o projeto tiver sido movido de pasta, ajuste os dois caminhos absolutos no arquivo antes da instalação.

```sh
mkdir -p "$HOME/Library/LaunchAgents"
cp deploy/launchd/br.com.inspectcheck.collector.plist "$HOME/Library/LaunchAgents/"
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/br.com.inspectcheck.collector.plist" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/br.com.inspectcheck.collector.plist"
```

Os logs ficam em `~/Library/Logs/inspectcheck-collector.log` e `~/Library/Logs/inspectcheck-collector-error.log`.

## Netlify

1. Importe este repositório no Netlify.
2. O Netlify detecta `netlify.toml`, executa `npm run build` e publica `dist`.
3. Cadastre as variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` e `COLLECTOR_RUNS_LOCALLY=true`.
4. Não cadastre nenhuma variável `CLASSIFIC_*` no Netlify. A coleta é exclusivamente local.

O redirect `/api/*` encaminha para a Netlify Function que reutiliza a API existente. O painel continua usando as mesmas URLs de API.
