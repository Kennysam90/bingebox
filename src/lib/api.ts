/** Thin fetch wrapper for the BingeBox API: JSON in/out, cookies, CSRF header, typed errors. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fields?: Record<string, string>
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-BingeBox-Client': 'web',
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      ...init,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach BingeBox right now. Check your connection and try again.', 'network');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.message ?? `Request failed (${res.status}).`, err?.code, err?.details?.fields);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>('GET', path, undefined, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('POST', path, body ?? {}, init),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
};
