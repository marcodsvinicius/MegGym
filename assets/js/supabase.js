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
    // Auth usa "error_code"; o banco (PostgREST) usa "code" (ex.: "42501").
    const code = body.error_code || (typeof body.code === "string" ? body.code : "") || body.error || "";
    return new SupabaseError(res.status, message, code);
  }

  async function authRequest(path, body, { method = "POST", token } = {}) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw await readError(res);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  async function signIn(email, password) {
    const data = await authRequest("token?grant_type=password", { email, password });
    saveSession(toSession(data));
    return session;
  }

  // Cria a conta. Devolve { confirmed: true } se já entrou, ou { confirmed: false }
  // quando o Supabase exige confirmação por e-mail antes do primeiro login.
  async function signUp(email, password, metadata, redirectTo) {
    const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    const data = await authRequest(`signup${query}`, { email, password, data: metadata });
    if (data.access_token) {
      saveSession(toSession(data));
      return { confirmed: true };
    }
    return { confirmed: false };
  }

  function recoverPassword(email, redirectTo) {
    return authRequest(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, { email });
  }

  async function updatePassword(password) {
    const token = await validToken();
    if (!token) throw new SupabaseError(401, "Sessão expirada. Entre de novo.");
    await authRequest("user", { password }, { method: "PUT", token });
  }

  // Links de e-mail (confirmação de conta / recuperação de senha) voltam com a sessão
  // no endereço: #access_token=...&type=recovery. Lê, salva e limpa o endereço.
  async function consumeUrlSession() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const clean = () => history.replaceState(null, "", location.pathname + location.search);
    if (hash.get("error") || hash.get("error_code")) {
      clean();
      throw new SupabaseError(400, hash.get("error_description") || "Link inválido ou expirado.", hash.get("error_code") || hash.get("error"));
    }
    const accessToken = hash.get("access_token");
    if (!accessToken) return null;
    clean();
    const user = await authRequest("user", undefined, { method: "GET", token: accessToken });
    saveSession(
      toSession({
        access_token: accessToken,
        refresh_token: hash.get("refresh_token"),
        expires_at: Number(hash.get("expires_at")) || undefined,
        expires_in: Number(hash.get("expires_in")) || 3600,
        user,
      })
    );
    return hash.get("type") || "login";
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
    signUp,
    signOut,
    recoverPassword,
    updatePassword,
    consumeUrlSession,
    get session() {
      return session;
    },
    db,
    uploadImage,
    publicImageUrl,
  };
})();
