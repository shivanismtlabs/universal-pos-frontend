import { useAuthStore } from "../auth-store";
import { getApiBaseUrl } from "../api-base";

export type ApiSuccess<T> = {
  success: true;
  data: T;
  message?: string;
};

export type ApiErrorBody = {
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  path?: string;
  timestamp?: string;
};

export type Paginated<T> = {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export class ApiError extends Error {
  status: number;
  messages: string[];

  constructor(status: number, message: string | string[]) {
    const messages = Array.isArray(message) ? message : [message];
    super(messages.join(", "));
    this.name = "ApiError";
    this.status = status;
    this.messages = messages;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  /** Skip 401 refresh retry (used internally) */
  _retry?: boolean;
};

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | ApiSuccess<{ accessToken: string; refreshToken: string }>
        | ApiErrorBody
        | null;

      if (!res.ok || !json || !("success" in json) || !json.success) {
        return false;
      }

      useAuthStore
        .getState()
        .setTokens(json.data.accessToken, json.data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function forceLogout() {
  useAuthStore.getState().clear();
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (!path.startsWith("/login") && !path.startsWith("/register")) {
      window.location.href = `/login?reason=session_expired`;
    }
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, token, headers = {}, _retry } = options;
  const hasBody = body !== undefined;

  let res: Response;
  try {
    res = await fetch(
      `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`,
      {
        method,
        headers: {
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: hasBody ? JSON.stringify(body) : undefined,
        cache: "no-store",
      },
    );
  } catch {
    throw new ApiError(
      0,
      "Cannot reach API. Start the backend with npm run start:dev",
    );
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  const isAuthPath =
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/register") ||
    path.startsWith("/auth/refresh");

  if (res.status === 401 && token && !_retry && !isAuthPath) {
    const ok = await tryRefreshTokens();
    if (ok) {
      const nextToken = useAuthStore.getState().accessToken;
      return apiRequest<T>(path, {
        ...options,
        token: nextToken,
        _retry: true,
      });
    }
    forceLogout();
    throw new ApiError(401, "Session expired. Please sign in again.");
  }

  if (!res.ok) {
    const err = json as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      err?.message ?? err?.error ?? `Request failed (${res.status})`,
    );
  }

  if (
    json &&
    typeof json === "object" &&
    "success" in json &&
    (json as ApiSuccess<T>).success === true &&
    "data" in json
  ) {
    return (json as ApiSuccess<T>).data;
  }

  return json as T;
}
