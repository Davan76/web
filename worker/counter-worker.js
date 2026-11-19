// Cloudflare Worker：每日與累積訪客計數，同一 IP 只算一次。
// 綁定設定（部署時在 Cloudflare 後台設定）：
//   - KV Namespace 綁定，變數名稱：COUNTS
//   - 環境變數（Secret）：SALT（任意一串亂數字母，例如 32 個字元）
// 只儲存 IP 的 SHA-256 雜湊（加鹽），不儲存原始 IP。
const ALLOW_ORIGINS = ["https://davan76.github.io", "http://localhost:8080"];

function corsHeaders(origin) {
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

async function hashIp(ip, salt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + "|" + ip));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// 以台北時間（UTC+8）切換「今天」
function taipeiDay(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

async function num(kv, key) {
  return Number(await kv.get(key)) || 0;
}

export default {
  async fetch(req, env) {
    const headers = corsHeaders(req.headers.get("Origin") || "");
    if (req.method === "OPTIONS") return new Response(null, { headers });
    if (req.method !== "GET") return new Response("method not allowed", { status: 405, headers });

    const kv = env.COUNTS;
    const url = new URL(req.url);
    const day = taipeiDay();
    const ip = req.headers.get("CF-Connecting-IP") || "unknown";
    const hip = await hashIp(ip, env.SALT || "");

    if (url.searchParams.get("hit") === "1") {
      // 累積：這個 IP 第一次出現才加一
      if (!(await kv.get("seen:" + hip))) {
        await kv.put("seen:" + hip, "1");
        await kv.put("total", String((await num(kv, "total")) + 1));
      }
      // 今天：這個 IP 今天第一次出現才加一（去重記錄保留 48 小時）
      const dk = `seen:${day}:${hip}`;
      if (!(await kv.get(dk))) {
        await kv.put(dk, "1", { expirationTtl: 48 * 3600 });
        await kv.put(`day:${day}`, String((await num(kv, `day:${day}`)) + 1), { expirationTtl: 72 * 3600 });
      }
    }

    const body = { date: day, day: await num(kv, `day:${day}`), total: await num(kv, "total") };
    return new Response(JSON.stringify(body), { headers: { ...headers, "Content-Type": "application/json" } });
  },
};
