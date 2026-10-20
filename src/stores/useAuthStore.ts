import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { apiJson } from "@/utils/api";

type AuthStatus = "loading" | "authed" | "guest";

type AuthState = {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  role: string | null;
  fullName: string | null;
  canAccessDashboard: boolean;
  canAccessFaturamento: boolean;
  canAccessExpenseDashboard: boolean;
  canAccessReports: boolean;
  canAccessProgramacao: boolean;
  canAccessFinanceiro: boolean;
  canAccessIris: boolean;
  canManageUsers: boolean;
  canManageConfig: boolean;
  error: string | null;
  init: () => void;
  signIn: (params: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

let unsubscribe: (() => void) | null = null;
let lastAccessMarkedForUser: string | null = null;

const markAccess = async (userId: string): Promise<void> => {
  if (lastAccessMarkedForUser === userId) return;
  lastAccessMarkedForUser = userId;
  try {
    await apiJson("/api/users/me/access", {
      method: "POST",
    });
  } catch {
    lastAccessMarkedForUser = null;
  }
};

const fetchOwnProfile = async (
  userId: string
): Promise<{
  role: string | null;
  fullName: string | null;
  canAccessDashboard: boolean;
  canAccessFaturamento: boolean;
  canAccessExpenseDashboard: boolean;
  canAccessReports: boolean;
  canAccessProgramacao: boolean;
  canAccessFinanceiro: boolean;
  canAccessIris: boolean;
  canManageUsers: boolean;
  canManageConfig: boolean;
}> => {
  if (!supabase) {
    return {
      role: null,
      fullName: null,
      canAccessDashboard: true,
      canAccessFaturamento: true,
      canAccessExpenseDashboard: true,
      canAccessReports: true,
      canAccessProgramacao: true,
      canAccessFinanceiro: true,
      canAccessIris: true,
      canManageUsers: true,
      canManageConfig: true,
    };
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    return {
      role: null,
      fullName: null,
      canAccessDashboard: true,
      canAccessFaturamento: true,
      canAccessExpenseDashboard: true,
      canAccessReports: true,
      canAccessProgramacao: true,
      canAccessFinanceiro: true,
      canAccessIris: true,
      canManageUsers: true,
      canManageConfig: true,
    };
  }
  const role = typeof data?.role === "string" ? data.role.toLowerCase() : null;
  const fallback = role === "admin";
  const boolFromProfile = (key: string) =>
    typeof data?.[key] === "boolean" ? Boolean(data[key]) : fallback;
  return {
    role,
    fullName: typeof data?.full_name === "string" ? data.full_name : null,
    canAccessDashboard: boolFromProfile("can_access_dashboard"),
    canAccessFaturamento: boolFromProfile("can_access_faturamento"),
    canAccessExpenseDashboard: boolFromProfile("can_access_expense_dashboard"),
    canAccessReports: boolFromProfile("can_access_reports"),
    canAccessProgramacao: boolFromProfile("can_access_programacao"),
    canAccessFinanceiro: boolFromProfile("can_access_financeiro"),
    canAccessIris: boolFromProfile("can_access_iris"),
    canManageUsers: boolFromProfile("can_manage_users"),
    canManageConfig: boolFromProfile("can_manage_config"),
  };
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  session: null,
  role: null,
  fullName: null,
  canAccessDashboard: true,
  canAccessFaturamento: true,
  canAccessExpenseDashboard: true,
  canAccessReports: true,
  canAccessProgramacao: true,
  canAccessFinanceiro: true,
  canAccessIris: true,
  canManageUsers: true,
  canManageConfig: true,
  error: null,

  init: () => {
    if (unsubscribe) return;
    if (!supabase) {
      set({
        status: "guest",
        user: null,
        session: null,
        error: "Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).",
      });
      return;
    }

    set({ status: "loading", error: null });
    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (error) {
          set({
            status: "guest",
            user: null,
            session: null,
            error: error.message,
          });
          return;
        }
        const user = data.session?.user ?? null;
        if (user) void markAccess(user.id);
        const profile = user
          ? await fetchOwnProfile(user.id)
          : {
              role: null,
              fullName: null,
              canAccessDashboard: false,
              canAccessFaturamento: false,
              canAccessExpenseDashboard: false,
              canAccessReports: false,
              canAccessProgramacao: false,
              canAccessFinanceiro: false,
              canAccessIris: false,
              canManageUsers: false,
              canManageConfig: false,
            };
        set({
          status: data.session ? "authed" : "guest",
          session: data.session,
          user,
          role: profile.role,
          fullName: profile.fullName,
          canAccessDashboard: profile.canAccessDashboard,
          canAccessFaturamento: profile.canAccessFaturamento,
          canAccessExpenseDashboard: profile.canAccessExpenseDashboard,
          canAccessReports: profile.canAccessReports,
          canAccessProgramacao: profile.canAccessProgramacao,
          canAccessFinanceiro: profile.canAccessFinanceiro,
          canAccessIris: profile.canAccessIris,
          canManageUsers: profile.canManageUsers,
          canManageConfig: profile.canManageConfig,
          error: null,
        });
      })
      .catch((e: unknown) => {
        set({
          status: "guest",
          user: null,
          session: null,
          error: e instanceof Error ? e.message : "Falha ao iniciar autenticação",
        });
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      const current = get();
      const sameUser = Boolean(user?.id && current.user?.id === user.id);
      set({
        status: session ? "authed" : "guest",
        session,
        user,
        role: user && sameUser ? current.role : null,
        fullName: user && sameUser ? current.fullName : null,
        canAccessDashboard: user && sameUser ? current.canAccessDashboard : false,
        canAccessFaturamento: user && sameUser ? current.canAccessFaturamento : false,
        canAccessExpenseDashboard: user && sameUser ? current.canAccessExpenseDashboard : false,
        canAccessReports: user && sameUser ? current.canAccessReports : false,
        canAccessProgramacao: user && sameUser ? current.canAccessProgramacao : false,
        canAccessFinanceiro: user && sameUser ? current.canAccessFinanceiro : false,
        canAccessIris: user && sameUser ? current.canAccessIris : false,
        canManageUsers: user && sameUser ? current.canManageUsers : false,
        canManageConfig: user && sameUser ? current.canManageConfig : false,
        error: null,
      });
      if (user) {
        void markAccess(user.id);
        fetchOwnProfile(user.id)
          .then((profile) => {
            const current = get().user;
            if (current?.id !== user.id) return;
            set({
              role: profile.role,
              fullName: profile.fullName,
              canAccessDashboard: profile.canAccessDashboard,
              canAccessFaturamento: profile.canAccessFaturamento,
              canAccessExpenseDashboard: profile.canAccessExpenseDashboard,
              canAccessReports: profile.canAccessReports,
              canAccessProgramacao: profile.canAccessProgramacao,
              canAccessFinanceiro: profile.canAccessFinanceiro,
              canAccessIris: profile.canAccessIris,
              canManageUsers: profile.canManageUsers,
              canManageConfig: profile.canManageConfig,
            });
          })
          .catch(() => undefined);
      }
    });

    unsubscribe = () => {
      data.subscription.unsubscribe();
      unsubscribe = null;
      const { init } = get();
      set({
        status: "loading",
        user: null,
        session: null,
        role: null,
        fullName: null,
        canAccessDashboard: true,
        canAccessFaturamento: true,
        canAccessExpenseDashboard: true,
        canAccessReports: true,
        canAccessProgramacao: true,
        canAccessFinanceiro: true,
        canAccessIris: true,
        canManageUsers: true,
        canManageConfig: true,
        error: null,
        init,
      });
    };
  },

  signIn: async ({ email, password }) => {
    if (!supabase) {
      set({
        status: "guest",
        user: null,
        session: null,
        error: "Supabase não configurado.",
      });
      return;
    }

    set({ error: null });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      set({ status: "guest", user: null, session: null, error: error.message });
      throw error;
    }

    const user = data.session?.user ?? null;
    if (user) await markAccess(user.id);
    const profile = user
      ? await fetchOwnProfile(user.id)
      : {
          role: null,
          fullName: null,
          canAccessDashboard: false,
          canAccessFaturamento: false,
          canAccessExpenseDashboard: false,
          canAccessReports: false,
          canAccessProgramacao: false,
          canAccessFinanceiro: false,
          canAccessIris: false,
          canManageUsers: false,
          canManageConfig: false,
        };
    set({
      status: data.session ? "authed" : "guest",
      session: data.session,
      user,
      role: profile.role,
      fullName: profile.fullName,
      canAccessDashboard: profile.canAccessDashboard,
      canAccessFaturamento: profile.canAccessFaturamento,
      canAccessExpenseDashboard: profile.canAccessExpenseDashboard,
      canAccessReports: profile.canAccessReports,
      canAccessProgramacao: profile.canAccessProgramacao,
      canAccessFinanceiro: profile.canAccessFinanceiro,
      canAccessIris: profile.canAccessIris,
      canManageUsers: profile.canManageUsers,
      canManageConfig: profile.canManageConfig,
      error: null,
    });
  },

  signOut: async () => {
    if (!supabase) {
      set({ status: "guest", user: null, session: null });
      return;
    }
    await supabase.auth.signOut();
    lastAccessMarkedForUser = null;
    set({
      status: "guest",
      user: null,
      session: null,
      role: null,
      fullName: null,
      canAccessDashboard: false,
      canAccessFaturamento: false,
      canAccessExpenseDashboard: false,
      canAccessReports: false,
      canAccessProgramacao: false,
      canAccessFinanceiro: false,
      canAccessIris: false,
      canManageUsers: false,
      canManageConfig: false,
    });
  },
}));
