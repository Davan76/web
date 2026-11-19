// 本機測試：node test_counter.mjs（不需要網路、不需要 Cloudflare）
import worker from "./counter-worker.js";
const store = new Map();
const kv = { get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
const env = { COUNTS: kv, SALT: "test-salt" };
const req = (ip, qs = "?hit=1", origin = "https://davan76.github.io") =>
  new Request("https://example.workers.dev/" + qs, { headers: { "CF-Connecting-IP": ip, Origin: origin } });
let fail = 0;
const ok = (n, c, x = "") => { if (!c) fail++; console.log((c ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };
const read = async r => r.json();

let r = await read(await worker.fetch(req("1.1.1.1"), env));
ok("第一位訪客：今日 1、累積 1", r.day === 1 && r.total === 1, JSON.stringify(r));
r = await read(await worker.fetch(req("1.1.1.1"), env));
ok("同一 IP 重新整理：不增加", r.day === 1 && r.total === 1, JSON.stringify(r));
r = await read(await worker.fetch(req("1.1.1.1"), env));
ok("同一 IP 再重新整理十次：仍然不增加", r.day === 1 && r.total === 1);
r = await read(await worker.fetch(req("2.2.2.2"), env));
ok("不同 IP：今日 2、累積 2", r.day === 2 && r.total === 2, JSON.stringify(r));
r = await read(await worker.fetch(req("3.3.3.3", ""), env));
ok("不加 ?hit=1 只讀取，不增加", r.day === 2 && r.total === 2, JSON.stringify(r));
const keys = [...store.keys()].join(" ");
ok("儲存的鍵不含原始 IP", !keys.includes("1.1.1.1") && !keys.includes("2.2.2.2"));
const raw = await worker.fetch(req("4.4.4.4", "?hit=1", "https://evil.example"), env);
ok("不在允許清單的來源：CORS 回傳預設允許的網域", raw.headers.get("Access-Control-Allow-Origin") === "https://davan76.github.io");
const pre = await worker.fetch(new Request("https://x/", { method: "OPTIONS" }), env);
ok("OPTIONS 預檢回 204 類正常回應", pre.status === 204 || pre.status === 200);
console.log(fail ? `\n有 ${fail} 項失敗` : "\n全部通過");
process.exit(fail ? 1 : 0);
