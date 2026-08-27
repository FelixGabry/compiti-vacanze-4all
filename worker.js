const KEY = "snapshot";

function allowedOrigin(origin) {
  if (!origin) return "";
  if (origin === "https://felixgabry.github.io") return origin;
  if (/^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return "";
}

function corsHeaders(origin) {
  const allow = allowedOrigin(origin);
  const headers = {
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (allow) headers["Access-Control-Allow-Origin"] = allow;
  return headers;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

function pinOk(req, env) {
  const header = req.headers.get("Authorization") || "";
  const got = header.replace(/^Bearer\s+/i, "").trim();
  const need = String(env.PIN || "").trim();
  return !!(got && need && got === need);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true }, 200, origin);
    }

    if (url.pathname !== "/state") {
      return json({ error: "not_found" }, 404, origin);
    }

    if (!pinOk(req, env)) {
      return json({ error: "pin" }, 401, origin);
    }

    if (req.method === "GET") {
      const raw = await env.STATE.get(KEY);
      if (!raw) {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      return new Response(raw, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders(origin),
        },
      });
    }

    if (req.method === "PUT") {
      let data;
      try {
        data = await req.json();
      } catch {
        return json({ error: "json" }, 400, origin);
      }
      if (!data || typeof data !== "object") {
        return json({ error: "json" }, 400, origin);
      }
      if (!data.updatedAt) data.updatedAt = Date.now();
      await env.STATE.put(KEY, JSON.stringify(data));
      return json({ ok: true, updatedAt: data.updatedAt }, 200, origin);
    }

    return json({ error: "method" }, 405, origin);
  },
};
