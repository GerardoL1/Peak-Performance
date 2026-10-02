// The one place the frontend talks to the API.
import axios from 'axios';
import type { Paginated } from './types';

export const http = axios.create({ baseURL: '/api', withCredentials: true });

// Any 401 outside the auth endpoints means the session ended; AuthProvider listens.
http.interceptors.response.use(undefined, (error) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
    window.dispatchEvent(new Event('auth:expired'));
  }
  return Promise.reject(error);
});

interface ErrorBody {
  error?: string;
  details?: { field: string; message: string }[];
}

const bodyOf = (error: unknown): ErrorBody | undefined =>
  axios.isAxiosError(error) ? (error.response?.data as ErrorBody | undefined) : undefined;

/** A sentence a person can act on. */
export function describeError(error: unknown): string {
  if (axios.isAxiosError(error) && !error.response) return 'Cannot reach the server. Is the API running?';
  const body = bodyOf(error);
  if (body?.details?.length && body.error !== 'Validation failed') {
    return `${body.error}: ${body.details.map((d) => d.message).join('; ')}`;
  }
  if (body?.error) return body.error;
  return 'Something went wrong. Please try again.';
}

/** Server validation/conflict details keyed by field name, for showing next to inputs. */
export function fieldErrors(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of bodyOf(error)?.details ?? []) if (d.field && !out[d.field]) out[d.field] = d.message;
  return out;
}

export type Params = Record<string, string | number | undefined>;

/** Typed CRUD helpers for a REST collection like /members. */
export function resource<T, Input = Record<string, unknown>>(path: string) {
  return {
    path,
    list: (params?: Params) => http.get<Paginated<T>>(path, { params }).then((r) => r.data),
    get: (id: number) => http.get<T>(`${path}/${id}`).then((r) => r.data),
    create: (body: Input) => http.post<T>(path, body).then((r) => r.data),
    update: (id: number, body: Input) => http.put<T>(`${path}/${id}`, body).then((r) => r.data),
    remove: (id: number) => http.delete(`${path}/${id}`).then(() => undefined),
  };
}

export const get = <T>(path: string, params?: Params) => http.get<T>(path, { params }).then((r) => r.data);
export const post = <T>(path: string, body?: unknown) => http.post<T>(path, body).then((r) => r.data);
export const patch = <T>(path: string, body?: unknown) => http.patch<T>(path, body).then((r) => r.data);
