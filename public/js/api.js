const adminKey = 'nf.adminToken';

export function getAdminToken() {
  return sessionStorage.getItem(adminKey) || localStorage.getItem(adminKey) || '';
}

export function setAdminToken(token, remember = false) {
  if (token) {
    sessionStorage.setItem(adminKey, token);
    if (remember) localStorage.setItem(adminKey, token);
  } else {
    sessionStorage.removeItem(adminKey);
    localStorage.removeItem(adminKey);
  }
}

export async function api(path, { method = 'GET', body, admin = false, token, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t = token || (admin ? getAdminToken() : '');
  if (t) headers['x-admin-token'] = t;
  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('The server is unreachable.');
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const apiGet = (path, opts = {}) => api(path, opts);
export const apiPost = (path, body, opts = {}) => api(path, { ...opts, method: 'POST', body });
export const apiPut = (path, body, opts = {}) => api(path, { ...opts, method: 'PUT', body });
export const apiPatch = (path, body, opts = {}) => api(path, { ...opts, method: 'PATCH', body });
export const apiDelete = (path, opts = {}) => api(path, { ...opts, method: 'DELETE' });
