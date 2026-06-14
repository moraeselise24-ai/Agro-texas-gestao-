import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, LogIn, Mail } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import ThemeToggle from "@/components/ThemeToggle";

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const signIn = useAuthStore((s) => s.signIn);
  const storeError = useAuthStore((s) => s.error);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname ?? "/";

  useEffect(() => {
    setError(null);
  }, [email, password]);

  if (status === "authed") {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!email.trim() || !password.trim()) {
        setError("Informe email e senha.");
        return;
      }

      await signIn({ email: email.trim(), password });
      navigate(from, { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao entrar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-app text-app">
      <div className="pointer-events-none fixed inset-0 bg-app-backdrop" />

      <div className="relative mx-auto flex min-h-dvh max-w-[1400px] items-center px-4 py-10">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full">
          <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-[28px] bg-surface-soft ring-1 ring-app backdrop-blur">
            <div className="grid md:grid-cols-2">
              <div className="relative hidden md:flex">
                <div className="absolute inset-0 bg-app-backdrop opacity-80" />
                <div className="relative flex w-full flex-col justify-between p-10">
                  <div className="space-y-6">
                    <img
                      src="/logo2.png"
                      alt="InspectCheck"
                      className="h-16 w-auto max-w-[220px] object-contain dark:hidden"
                    />
                    <img
                      src="/logo.png"
                      alt="InspectCheck"
                      className="hidden h-16 w-auto max-w-[220px] object-contain dark:block"
                    />
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-app-soft">
                        InspectCheck
                      </div>
                      <div className="text-3xl font-semibold tracking-tight">
                        Painel Executivo
                      </div>
                      <div className="max-w-sm text-sm text-app-soft">
                        Indicadores, relatórios e controles para acompanhamento
                        diário.
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-app-faint">
                    Acesso interno • Sessão para pessoas credenciadas
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-10">
                <div className="mb-8 flex items-center justify-between gap-4 md:hidden">
                  <img
                    src="/logo2.png"
                    alt="InspectCheck"
                    className="h-12 w-auto max-w-[160px] object-contain dark:hidden"
                  />
                  <img
                    src="/logo.png"
                    alt="InspectCheck"
                    className="hidden h-12 w-auto max-w-[160px] object-contain dark:block"
                  />
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-[0.2em] text-app-soft">
                      InspectCheck
                    </div>
                    <div className="mt-1 text-lg font-semibold tracking-tight">
                      Entrar
                    </div>
                  </div>
                </div>

                <form onSubmit={onSubmit} className="space-y-6">
                  <div className="hidden md:block">
                    <div className="text-xs uppercase tracking-[0.2em] text-app-soft">
                      Bem-vindo
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                      Entrar na sua conta
                    </h1>
                    <div className="mt-2 text-sm text-app-soft">
                      Use seu email corporativo para acessar o painel.
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-[0.2em] text-app-faint">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
                        <input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="email"
                          inputMode="email"
                          placeholder="seuemail@empresa.com"
                          className="h-11 w-full rounded-2xl bg-table-head pl-10 pr-3 text-sm text-app outline-none ring-1 ring-app placeholder:text-slate-400 dark:placeholder:text-white/30 focus:ring-app-strong"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-[0.2em] text-app-faint">
                        Senha
                      </label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
                        <input
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          className="h-11 w-full rounded-2xl bg-table-head pl-10 pr-12 text-sm text-app outline-none ring-1 ring-app placeholder:text-slate-400 dark:placeholder:text-white/30 focus:ring-app-strong"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                          aria-label={
                            showPassword ? "Ocultar senha" : "Mostrar senha"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-app-muted" />
                          ) : (
                            <Eye className="h-4 w-4 text-app-muted" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setError("Recuperação de senha em breve.")}
                      className="ml-auto text-sm text-app-soft underline-offset-4 hover:text-app hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>

                  {error || storeError ? (
                    <div className="rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200 ring-1 ring-red-400/20">
                      {error ?? storeError}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-emerald-500/20 text-sm font-semibold text-emerald-800 dark:text-emerald-100 ring-1 ring-emerald-400/30 transition hover:bg-emerald-500/25 disabled:opacity-60"
                  >
                    {submitting ? (
                      "Entrando..."
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <LogIn className="h-4 w-4" />
                        Entrar
                      </span>
                    )}
                  </button>

                  <div className="text-xs text-app-faint">
                    Ao entrar, você concorda com as políticas internas de acesso.
                  </div>
                </form>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-app-faint" />
        </div>
      </div>
    </div>
  );
}
