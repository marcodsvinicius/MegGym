/* Cliente mínimo da API REST do Supabase (banco, login e imagens), sem dependências. */
(function () {
  "use strict";

  const { SUPABASE_URL, SUPABASE_KEY, IMAGE_BUCKET } = window.MEGGYM_CONFIG;
  const SESSION_KEY = "meggym.supabase.session";

  class SupabaseError extends Error {
    constructor(status, message, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  /* ---------------- Sessão (login) ---------------- */

  let session = null;
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    session = null;
  }

  function saveSession(next) {
    session = next;
    try {
      if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* sem localStorage: a sessão vale só enquanto a aba estiver aberta */
    }
  }

  function toSession(data) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      email: data.user?.email || session?.email || "",
    };
  }

  async function readError(res) {
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* corpo vazio */
    }
    const message = body.msg || body.message || body.error_description || body.error || `HTTP ${res.status}`;
    return new SupabaseError(res.status, message, body.code || body.error_code || body.error);
  }

  async function authRequest(path, body) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await readError(res);
    return res.json();
  }

  async function signIn(email, password) {
    try {
      const data = await authRequest("token?grant_type=password", { email, password });
      saveSession(toSession(data));
      return session;
    } catch (err) {
      if (err.status === 400) throw new SupabaseError(400, "E-mail ou senha incorretos.");
      throw err;
    }
  }

  let refreshing = null;
  async function refresh() {
    if (!session?.refresh_token) throw new SupabaseError(401, "Sessão expirada. Entre de novo.");
    refreshing ||= authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
      .then((data) => saveSession(toSession(data)))
      .catch((err) => {
        saveSession(null);
        throw new SupabaseError(401, "Sessão expirada. Entre de novo.", err.code);
      })
      .finally(() => (refreshing = null));
    await refreshing;
  }

  async function validToken() {
    if (!session) return null;
    if (session.expires_at - 60 < Date.now() / 1000) await refresh();
    return session.access_token;
  }

  async function signOut() {
    const token = session?.access_token;
    saveSession(null);
    if (token) {
      fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }

  /* ---------------- Requisições autenticadas ---------------- */

  async function request(url, { method = "GET", body, headers = {}, auth = false } = {}, retried = false) {
    const token = auth ? await validToken() : null;
    const res = await fetch(url, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body,
      cache: "no-store",
    });
    if (res.status === 401 && auth && !retried && session) {
      await refresh();
      return request(url, { method, body, headers, auth }, true);
    }
    if (!res.ok) throw await readError(res);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // Banco (PostgREST). Ex.: db("exercises?select=*&order=position")
  function db(path, { method = "GET", body, auth = false, returning = true, upsert = false } = {}) {
    const prefer = [returning ? "return=representation" : "return=minimal"];
    if (upsert) prefer.push("resolution=merge-duplicates");
    return request(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      auth,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" ? { Prefer: prefer.join(",") } : {}),
      },
    });
  }

  /* ---------------- Imagens (Storage) ---------------- */

  function publicImageUrl(path) {
    return `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }

  async function uploadImage(path, file) {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    await request(`${SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}/${encoded}`, {
      method: "POST",
      auth: true,
      body: file,
      headers: { "Content-Type": file.type, "Cache-Control": "max-age=31536000", "x-upsert": "false" },
    });
    return publicImageUrl(path);
  }

  window.Supa = {
    SupabaseError,
    signIn,
    signOut,
    get session() {
      return session;
    },
    db,
    uploadImage,
    publicImageUrl,
  };
})();
