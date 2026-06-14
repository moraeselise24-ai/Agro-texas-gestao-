import { useState } from "react";
import { Banknote, Calculator, Lightbulb, ReceiptText } from "lucide-react";
import Despesas from "@/pages/Despesas";
import Receitas from "@/pages/Receitas";
import ResultadoFinanceiro from "@/pages/ResultadoFinanceiro";
import { cn } from "@/lib/utils";

type FinanceTab = "despesas" | "receitas" | "resultado";

const tabs: Array<{ value: FinanceTab; label: string; icon: typeof ReceiptText }> = [
  { value: "despesas", label: "Despesas", icon: ReceiptText },
  { value: "receitas", label: "Receitas", icon: Banknote },
  { value: "resultado", label: "Resultado", icon: Calculator },
];

const tips: Record<FinanceTab, Array<{ title: string; body: string }>> = {
  despesas: [
    {
      title: "Contas abertas",
      body: "Use status A pagar ou Agendada para acompanhar vencimentos sem misturar com o que já foi pago.",
    },
    {
      title: "Recorrência",
      body: "Marque como recorrente custos fixos como contador, convênios, hospedagem mensal ou contratos.",
    },
  ],
  receitas: [
    {
      title: "A receber",
      body: "Use Receber em para prever entrada de caixa e Recebida quando o valor cair de fato.",
    },
    {
      title: "Categorias",
      body: "Separe faturamento operacional, reembolso e serviços extras para ler melhor o resultado.",
    },
  ],
  resultado: [
    {
      title: "Resultado real",
      body: "Compara receitas já lançadas contra despesas do período.",
    },
    {
      title: "Resultado projetado",
      body: "Usa o faturamento estimado quando ele for maior que as receitas lançadas, evitando dupla contagem.",
    },
  ],
};

export default function Financeiro() {
  const [activeTab, setActiveTab] = useState<FinanceTab>("despesas");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
            Operação
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Financeiro
          </h1>
          <div className="mt-2 text-sm text-app-soft">
            Controle de despesas, receitas e contas operacionais.
          </div>
        </div>

        <div className="inline-flex rounded-2xl bg-surface-soft p-1 ring-1 ring-app">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm transition",
                  isActive
                    ? "bg-surface-active text-app shadow-sm ring-1 ring-app"
                    : "text-app-muted hover:bg-surface-hover hover:text-app"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-200">
            <Lightbulb className="h-4 w-4" />
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
            {tips[activeTab].map((tip) => (
              <div key={tip.title} className="min-w-0">
                <div className="text-xs uppercase tracking-[0.16em] text-app-faint">
                  {tip.title}
                </div>
                <div className="mt-1 text-sm leading-relaxed text-app-soft">
                  {tip.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "despesas" ? (
        <Despesas embedded />
      ) : activeTab === "receitas" ? (
        <Receitas embedded />
      ) : (
        <ResultadoFinanceiro />
      )}
    </div>
  );
}
