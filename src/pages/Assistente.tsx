import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Check, Copy, Loader2, Maximize2, MessageSquare, Plus, Send, Sparkles, Trash2, UserRoundCheck, WalletCards, X } from "lucide-react";
import Card from "@/components/Card";
import ChartCard from "@/components/ChartCard";
import DateRangePicker from "@/components/DateRangePicker";
import IrisIcon from "@/components/IrisIcon";
import { cn } from "@/lib/utils";
import { useRangeStore } from "@/stores/useRangeStore";
import { apiGet, apiJson } from "@/utils/api";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AssistantResponse = {
  answer: string;
  aiEnabled: boolean;
  conversation: ConversationSummary;
  contextSummary: {
    range: { from: string; to: string };
    highlights: string[];
  };
};

type ConversationSummary = {
  id: string;
  title: string;
  range: { from: string | null; to: string | null };
  aiEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type StoredMessage = ChatMessage & {
  id: string;
  createdAt: string | null;
};

const quickPrompts = [
  {
    label: "Resumo do período",
    prompt: "Faça um resumo executivo do período, com operação, faturamento, financeiro e alertas.",
  },
  {
    label: "Pendências",
    prompt: "Quais são as principais pendências, contas a pagar, receitas a receber e pontos de atenção?",
  },
  {
    label: "RNE",
    prompt: "Analise os RNE do período. Quantos foram, em quais dias e o que merece atenção?",
  },
  {
    label: "Financeiro",
    prompt: "Explique o resultado financeiro do período comparando faturamento estimado, receitas e despesas.",
  },
];

const renderChatText = (content: string): ReactNode => {
  return content.split("\n").map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <div key={`${line}-${lineIndex}`} className={line.trim() ? "" : "h-3"}>
        {parts.map((part, partIndex) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={`${part}-${partIndex}`} className="font-semibold text-app">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <span key={`${part}-${partIndex}`}>{part}</span>;
        })}
      </div>
    );
  });
};

export default function Assistente() {
  const { range, setRange } = useRangeStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Olá. Eu sou a Iris, a inteligência da InspectCheck. Posso analisar operação, RNE, faturamento, despesas, receitas e programação com base no período perguntado ou selecionado.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [chatExpanded, setChatExpanded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const history = useMemo(
    () => messages.filter((message) => message.role === "user" || message.role === "assistant"),
    [messages]
  );

  const loadConversations = () => {
    setLoadingHistory(true);
    apiGet<{ conversations: ConversationSummary[] }>("/api/assistant/conversations")
      .then((response) => setConversations(response.conversations ?? []))
      .catch(() => undefined)
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    if (!chatExpanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [chatExpanded]);

  const newConversation = () => {
    setConversationId(null);
    setAiEnabled(null);
    setHighlights([]);
    setMessages([
              {
                role: "assistant",
                content:
          "Olá. Eu sou a Iris, a inteligência da InspectCheck. Posso analisar operação, RNE, faturamento, despesas, receitas e programação com base no período perguntado ou selecionado.",
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const openConversation = async (id: string) => {
    if (loading) return;
    setLoadingHistory(true);
    try {
      const response = await apiGet<{
        conversation: ConversationSummary;
        messages: StoredMessage[];
      }>(`/api/assistant/conversations/${id}`);
      setConversationId(response.conversation.id);
      setAiEnabled(response.conversation.aiEnabled);
      setMessages(
        response.messages.length
          ? response.messages.map((message) => ({
              role: message.role,
              content: message.content,
            }))
          : [
              {
                role: "assistant",
                content: "Conversa aberta, mas ainda sem mensagens registradas.",
              },
            ]
      );
      if (response.conversation.range.from && response.conversation.range.to) {
        setRange({
          from: response.conversation.range.from,
          to: response.conversation.range.to,
        });
      }
    } catch (error: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? `Não consegui abrir essa conversa: ${error.message}`
              : "Não consegui abrir essa conversa.",
        },
      ]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteConversation = async (conversation: ConversationSummary) => {
    const ok = window.confirm(`Apagar a conversa "${conversation.title}"?`);
    if (!ok) return;
    try {
      await apiJson(`/api/assistant/conversations/${conversation.id}`, {
        method: "DELETE",
      });
      setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
      if (conversationId === conversation.id) {
        newConversation();
      }
    } catch (error: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? `Não consegui apagar a conversa: ${error.message}`
              : "Não consegui apagar a conversa.",
        },
      ]);
    }
  };

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || loading) return;
    setInput("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const response = await apiJson<AssistantResponse>("/api/assistant", {
        method: "POST",
        body: {
          question: text,
          messages: history,
          conversationId,
          range,
        },
      });
      setMessages((prev) => [...prev, { role: "assistant", content: response.answer }]);
      setConversationId(response.conversation.id);
      setAiEnabled(response.aiEnabled);
      setHighlights(response.contextSummary.highlights ?? []);
      loadConversations();
    } catch (error: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? `Não consegui consultar agora: ${error.message}`
              : "Não consegui consultar agora.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(input);
  };

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1600);
    } catch {
      const el = document.createElement("textarea");
      el.value = content;
      el.setAttribute("readonly", "true");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1600);
    }
  };

  const renderChatPanel = (expanded = false) => (
    <Card className={cn("flex min-h-0 flex-col p-5", expanded && "h-full rounded-3xl")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold tracking-tight">Chat com a Iris</div>
          <div className="mt-1 text-xs text-app-soft">
            {aiEnabled === null ? "Contexto real do sistema" : aiEnabled ? "IA conectada ao contexto real" : "Modo análise local"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setChatExpanded(expanded ? false : true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
          aria-label={expanded ? "Fechar chat expandido" : "Maximizar chat"}
          title={expanded ? "Fechar" : "Maximizar chat"}
        >
          {expanded ? <X className="h-4 w-4 text-app-muted" /> : <Maximize2 className="h-4 w-4 text-app-muted" />}
        </button>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "group relative max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ring-1",
                  expanded && "max-w-[78%]",
                  message.role === "user"
                    ? "bg-emerald-500/15 text-app ring-emerald-500/25"
                    : "bg-surface-soft text-app-muted ring-app"
                )}
              >
                {message.role === "assistant" ? (
                  <button
                    type="button"
                    onClick={() => void copyMessage(message.content, index)}
                    className={cn(
                      "absolute right-2 top-2 inline-flex h-8 items-center gap-1.5 rounded-xl px-2 text-xs transition",
                      "bg-app-panel/80 text-app-soft opacity-0 ring-1 ring-app backdrop-blur",
                      "hover:bg-surface-hover hover:text-app group-hover:opacity-100 focus:opacity-100"
                    )}
                    aria-label="Copiar resposta"
                    title="Copiar resposta"
                  >
                    {copiedIndex === index ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copiar
                      </>
                    )}
                  </button>
                ) : null}
                <div className="whitespace-pre-wrap">{renderChatText(message.content)}</div>
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl bg-surface-soft px-4 py-3 text-sm text-app-soft ring-1 ring-app">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando dados do sistema...
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap gap-2">
          {quickPrompts.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => void ask(item.prompt)}
              disabled={loading}
              className="rounded-xl bg-surface-soft px-3 py-2 text-xs text-app-muted ring-1 ring-app transition hover:bg-surface-hover hover:text-app disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-3 flex shrink-0 gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(event);
              }
            }}
            placeholder="Ex.: O que merece atenção hoje?"
            className="min-h-[48px] flex-1 resize-none rounded-2xl bg-surface-soft px-4 py-3 text-sm text-app outline-none ring-1 ring-app focus:ring-app-strong"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-800 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/30 disabled:opacity-40 dark:text-emerald-100"
            aria-label="Enviar pergunta"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </Card>
  );

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[680px] flex-col gap-5 overflow-hidden">
      <header className="shrink-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-200">
              <IrisIcon className="h-3.5 w-3.5" />
              Iris
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              Iris InspectCheck
            </h1>
            <div className="mt-2 max-w-[760px] text-sm text-app-soft">
              Converse com a Iris para analisar operação, faturamento, RNE,
              financeiro e programação no período perguntado ou selecionado.
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 p-px">
            <button
              type="button"
              onClick={newConversation}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-500/15 px-4 text-sm text-emerald-800 ring-1 ring-emerald-500/25 transition hover:bg-emerald-500/25 dark:text-emerald-100"
            >
              <Plus className="h-4 w-4" />
              Nova conversa
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-app-panel p-3 shadow-app ring-1 ring-app">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3 text-sm text-app-muted">
              <CalendarDays className="h-4 w-4 text-app-soft" />
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-app-faint">
                  Período de análise
                </div>
                <div className="mt-0.5">
                  {range.from} → {range.to}
                </div>
              </div>
            </div>

            <div className="min-w-0 lg:min-w-[640px]">
              <DateRangePicker value={range} onChange={setRange} />
            </div>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {renderChatPanel()}

        <aside className="-mr-1 min-h-0 space-y-5 overflow-y-auto overscroll-contain px-1 pb-1">
          <ChartCard title="Capacidades" subtitle="A Iris usa o período perguntado ou selecionado">
            <div className="space-y-3 text-sm text-app-muted">
              <div className="flex gap-3">
                <IrisIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                Responde sobre OS, volume, RNE, clientes, pontos e classificadores.
              </div>
              <div className="flex gap-3">
                <WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                Cruza faturamento estimado, receitas, despesas e pendências.
              </div>
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                Usa programação e vencimentos para apontar próximos passos.
              </div>
              <div className="flex gap-3">
                <UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                Analisa dias trabalhados, diárias, O.S. e produção por classificador.
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Histórico" subtitle={loadingHistory ? "Carregando..." : `${conversations.length} conversa(s)`}>
            {conversations.length ? (
              <div className="-mx-1 max-h-[300px] space-y-2 overflow-y-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={cn(
                      "group flex items-start gap-2 rounded-2xl p-2 ring-1 transition",
                      conversationId === conversation.id
                        ? "bg-emerald-500/12 ring-emerald-500/30"
                        : "bg-surface-soft ring-app hover:bg-surface-hover"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void openConversation(conversation.id)}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1 text-left text-sm text-app-muted transition hover:text-app"
                    >
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{conversation.title}</span>
                        <span className="mt-1 block truncate text-xs text-app-faint">
                          {conversation.range.from ?? "—"} → {conversation.range.to ?? "—"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteConversation(conversation)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-app-faint opacity-70 transition hover:bg-rose-500/10 hover:text-rose-700 group-hover:opacity-100 dark:hover:text-rose-200"
                      aria-label="Apagar conversa"
                      title="Apagar conversa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-surface-soft p-4 text-sm text-app-soft ring-1 ring-app">
                Nenhuma conversa salva ainda.
              </div>
            )}
          </ChartCard>

          <ChartCard title="Leitura rápida" subtitle="Último contexto consultado">
            {highlights.length ? (
              <div className="space-y-3">
                {highlights.map((item) => (
                  <div key={item} className="rounded-2xl bg-surface-soft p-3 text-sm text-app-muted ring-1 ring-app">
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-surface-soft p-4 text-sm text-app-soft ring-1 ring-app">
                Faça uma pergunta para gerar os primeiros insights.
              </div>
            )}
          </ChartCard>

          <ChartCard title="Modo atual" subtitle="Conexão da inteligência">
            <div className="flex items-start gap-3 rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div className="text-sm text-app-muted">
                {aiEnabled
                  ? "Iris ativa com contexto real do sistema."
                  : "Sem chave de IA detectada ou ainda não consultado. A Iris usa resposta local baseada nos dados."}
              </div>
            </div>
          </ChartCard>
        </aside>
      </div>

      {chatExpanded ? (
        <div className="fixed inset-0 z-50 bg-app-overlay p-4 backdrop-blur sm:p-6">
          <div className="mx-auto h-full max-w-[1200px]">
            {renderChatPanel(true)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
