import { supabase } from "@/lib/supabase";

export type ApiResult<T> = T & { success: true };

export type ApiError = { success: false; error: string };
type ApiResponse<T> = ApiResult<T> | ApiError;

const authHeaders = async (): Promise<Record<string, string>> => {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

export const apiGet = async <T>(url: string): Promise<ApiResult<T>> => {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: await authHeaders(),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error((json as ApiError).error || "Erro na API");
  }
  return json;
};

export const apiJson = async <T>(
  url: string,
  init: Omit<RequestInit, "body"> & { body?: unknown }
): Promise<ApiResult<T>> => {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...(init.headers ?? {}),
    },
    body: init.body == null ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error((json as ApiError).error || "Erro na API");
  }
  return json;
};
