export type ApiResult<T> = T & { success: true };

export type ApiError = { success: false; error: string };
type ApiResponse<T> = ApiResult<T> | ApiError;

export const apiGet = async <T>(url: string): Promise<ApiResult<T>> => {
  const res = await fetch(url, { credentials: "same-origin" });
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
