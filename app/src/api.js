// Thin fetch wrapper. Session lives in an HttpOnly cookie; the custom header is the CSRF guard.
export class ApiError extends Error {
  constructor(status, code, fields) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// Empty by default: the app is served by the API. Set VITE_API_BASE to the API origin when the
// frontend is hosted separately (e.g. https://api.example.com).
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(BASE + '/api' + path, {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'team26' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || 'generic', data?.fields);
  return data;
}
export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const patch = (path, body = {}) => api(path, { method: 'PATCH', body });
