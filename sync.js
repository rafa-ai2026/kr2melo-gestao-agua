(() => {
  'use strict';
  const CONFIG_KEY = 'kr2melo.sync.supabase.v1';
  let pushTimer = null;
  const now = () => new Date().toISOString();
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(CONFIG_KEY));
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  };
  const write = value => localStorage.setItem(CONFIG_KEY, JSON.stringify(value));
  const cleanUrl = value => String(value || '').trim().replace(/\/+$/, '');
  const errMessage = async response => {
    let body = null;
    try { body = await response.json(); } catch { try { body = await response.text(); } catch {} }
    const message = body?.msg || body?.message || body?.error_description || body?.error || (typeof body === 'string' ? body : '');
    return message || `Erro de sincronização (${response.status}).`;
  };
  function getConfig() { return { ...read() }; }
  function setConfig(partial) {
    const current = read();
    const next = { ...current, ...partial };
    next.url = cleanUrl(next.url);
    next.autoSync = next.autoSync === true;
    write(next);
    return { ...next };
  }
  function clearConfig() { localStorage.removeItem(CONFIG_KEY); }
  function configured() { const c = read(); return Boolean(cleanUrl(c.url) && String(c.anonKey || '').trim()); }
  function connected() { const c = read(); return configured() && Boolean(c.accessToken && c.user?.id); }
  function autoEnabled() { return connected() && read().autoSync === true; }
  function dispatch(type, detail = {}) { document.dispatchEvent(new CustomEvent(`kr2sync:${type}`, { detail })); }
  async function request(path, options = {}, token = '') {
    const config = read();
    if (!configured()) throw new Error('Informe a URL do projeto Supabase e a chave pública (anon/publishable).');
    const headers = { apikey: config.anonKey, ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${cleanUrl(config.url)}${path}`, { ...options, headers });
    if (!response.ok) throw new Error(await errMessage(response));
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  function saveSession(session, user) {
    if (!session?.access_token) return setConfig({ user: user || null });
    const expiresAt = session.expires_at ? Number(session.expires_at) * 1000 : Date.now() + Math.max(0, Number(session.expires_in) || 3600) * 1000;
    const config = setConfig({ accessToken: session.access_token, refreshToken: session.refresh_token || '', expiresAt, user: user || session.user || null });
    dispatch('session', { config });
    return config;
  }
  async function refreshSessionIfNeeded() {
    const config = read();
    if (!connected()) throw new Error('Entre na sincronização antes de usar a nuvem.');
    if (Number(config.expiresAt || 0) > Date.now() + 60000) return config;
    if (!config.refreshToken) throw new Error('Sua sessão expirou. Entre novamente.');
    const data = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: config.refreshToken }) });
    return saveSession(data, data.user);
  }
  async function signIn(email, password) {
    const data = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') }) });
    if (!data?.access_token) throw new Error('Não foi possível iniciar a sessão. Confira e-mail e senha.');
    return saveSession(data, data.user);
  }
  async function signUp(email, password) {
    const data = await request('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') }) });
    if (data?.access_token || data?.session?.access_token) {
      return { config: saveSession(data.session || data, data.user || data.session?.user), confirmationRequired: false };
    }
    setConfig({ user: data?.user || null });
    return { config: getConfig(), confirmationRequired: true };
  }
  async function pullState() {
    const config = await refreshSessionIfNeeded();
    const uid = encodeURIComponent(config.user.id);
    const data = await request(`/rest/v1/kr2melo_sync_state?user_id=eq.${uid}&select=payload,updated_at&limit=1`, { method: 'GET' }, config.accessToken);
    const row = Array.isArray(data) ? data[0] : null;
    const next = setConfig({ lastPullAt: now(), remoteUpdatedAt: row?.updated_at || '' });
    dispatch('pull', { updatedAt: row?.updated_at || '', found: Boolean(row) });
    return row?.payload || null;
  }
  async function pushState(payload) {
    const config = await refreshSessionIfNeeded();
    const body = [{ user_id: config.user.id, payload, updated_at: now() }];
    const data = await request('/rest/v1/kr2melo_sync_state?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(body) }, config.accessToken);
    const row = Array.isArray(data) ? data[0] : null;
    setConfig({ lastPushAt: now(), remoteUpdatedAt: row?.updated_at || now() });
    dispatch('push', { updatedAt: row?.updated_at || '' });
    return row;
  }
  function queuePush(payload) {
    if (!autoEnabled() || !navigator.onLine) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushState(payload).catch(error => dispatch('error', { error })), 2500);
  }
  async function deleteRemote() {
    const config = await refreshSessionIfNeeded();
    const uid = encodeURIComponent(config.user.id);
    await request(`/rest/v1/kr2melo_sync_state?user_id=eq.${uid}`, { method: 'DELETE' }, config.accessToken);
    setConfig({ lastPushAt: '', lastPullAt: '', remoteUpdatedAt: '' });
    dispatch('delete');
  }
  function signOut() {
    const current = read();
    write({ url: current.url || '', anonKey: current.anonKey || '', autoSync: false, lastPushAt: '', lastPullAt: '' });
    dispatch('session', { config: getConfig() });
  }
  window.KR2Sync = { getConfig, setConfig, clearConfig, configured, connected, autoEnabled, signIn, signUp, signOut, pullState, pushState, queuePush, deleteRemote };
})();
