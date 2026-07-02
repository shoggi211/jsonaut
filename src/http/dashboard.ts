import type { Stats } from "../core/metrics.js";

const n = (v: number | undefined): number => v ?? 0;

/** Self-contained HTML usage dashboard for the /dashboard route. */
export function renderDashboard(s: Stats): string {
  const t = s.totals ?? {};
  const reqs = n(t.requests);
  const direct = n(t.direct);
  const detOk = n(t.deterministic_success);
  const paid = n(t.llm_paid);
  const llmFail = n(t.llm_failed);
  const pay402 = n(t.payment_required);
  const limited = n(t.rate_limited);
  const validates = n(t.validate_requests);
  const revenue = n(t.revenue_micros) / 1e6;
  const freeOk = direct + detOk;
  const solved = freeOk + paid;
  const solveRate = reqs ? Math.round((solved / reqs) * 1000) / 10 : 0;

  const days = Object.keys(s.days ?? {}).sort().slice(-14).reverse();
  const rows = days
    .map((d) => {
      const x = s.days[d] ?? {};
      const free = n(x.direct) + n(x.deterministic_success);
      return `<tr><td>${d}</td><td>${n(x.requests)}</td><td>${free}</td><td>${n(x.llm_paid)}</td><td>${n(x.payment_required)}</td><td>$${(n(x.revenue_micros) / 1e6).toFixed(2)}</td></tr>`;
    })
    .join("");

  const card = (label: string, value: string, sub = "", accent = false) =>
    `<div class="card${accent ? " accent" : ""}"><div class="v">${value}</div><div class="l">${label}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jsonaut · usage</title>
<meta http-equiv="refresh" content="20">
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#0b0e14;color:#e6e6e6;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:28px;max-width:920px;margin:0 auto}
  h1{font-size:19px;margin:0 0 2px}
  .muted{color:#8a94a6;font-size:13px;margin-bottom:22px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:26px}
  .card{background:#141925;border:1px solid #222b3a;border-radius:12px;padding:16px}
  .card .v{font-size:26px;font-weight:600;letter-spacing:-.02em}
  .card .l{color:#8a94a6;font-size:13px;margin-top:4px}
  .card .s{color:#5b6577;font-size:12px;margin-top:3px}
  .card.accent{border-color:#1f5138}.card.accent .v{color:#4ade80}
  table{width:100%;border-collapse:collapse;font-size:13px}
  caption{text-align:left;color:#8a94a6;margin-bottom:8px;font-size:13px}
  th,td{text-align:right;padding:8px 10px;border-bottom:1px solid #1c2432}
  th:first-child,td:first-child{text-align:left}
  th{color:#8a94a6;font-weight:500}
</style></head><body>
<h1>Jsonaut — usage</h1>
<div class="muted">since ${s.since?.slice(0, 10) ?? "—"} · updated ${s.updatedAt?.replace("T", " ").slice(0, 16) ?? "—"} UTC · auto-refresh 20s</div>
<div class="grid">
  ${card("Total requests", reqs.toLocaleString())}
  ${card("Solved", solved.toLocaleString(), solveRate + "% of requests")}
  ${card("Free repairs", freeOk.toLocaleString(), `${direct} instant · ${detOk} repaired`)}
  ${card("Paid repairs (x402)", paid.toLocaleString(), `${pay402} payment challenges`, true)}
  ${card("Revenue (USDC)", "$" + revenue.toFixed(2), "", true)}
  ${card("LLM failures", llmFail.toLocaleString())}
  ${card("Rate-limited", limited.toLocaleString())}
  ${card("Validate calls", validates.toLocaleString())}
</div>
<table>
  <caption>Last 14 days</caption>
  <thead><tr><th>Day</th><th>Requests</th><th>Free</th><th>Paid</th><th>402s</th><th>Revenue</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#5b6577">no data yet — make a request to /v1/repair</td></tr>'}</tbody>
</table>
</body></html>`;
}
