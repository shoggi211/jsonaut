export const DEMO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jsonaut — JSON repair for AI agents</title>
<style>
  :root { --bg:#0d1117; --panel:#161b22; --border:#30363d; --text:#e6edf3; --dim:#8b949e; --accent:#3fb950; --bad:#f85149; --warn:#d29922; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:ui-monospace,SFMono-Regular,Consolas,monospace; line-height:1.5; }
  .wrap { max-width:880px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:28px; margin:0 0 4px; }
  h1 span { color:var(--accent); }
  .tag { color:var(--dim); margin:0 0 24px; font-size:14px; }
  textarea { width:100%; background:var(--panel); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:12px; font-family:inherit; font-size:13px; min-height:140px; resize:vertical; }
  textarea:focus { outline:1px solid var(--accent); }
  label { display:block; font-size:12px; color:var(--dim); margin:16px 0 6px; text-transform:uppercase; letter-spacing:0.5px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; margin:16px 0; align-items:center; }
  button { background:var(--accent); color:#04260f; border:0; border-radius:8px; padding:10px 20px; font-family:inherit; font-size:14px; font-weight:700; cursor:pointer; }
  button:hover { filter:brightness(1.1); }
  button.sample { background:var(--panel); color:var(--dim); border:1px solid var(--border); font-weight:400; font-size:12px; padding:6px 12px; }
  button.sample:hover { color:var(--text); }
  details { margin:12px 0; }
  summary { color:var(--dim); font-size:13px; cursor:pointer; }
  .out { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:16px; margin-top:20px; display:none; }
  .badge { display:inline-block; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:700; margin-bottom:10px; }
  .badge.ok { background:#12351d; color:var(--accent); }
  .badge.fail { background:#3d1214; color:var(--bad); }
  .badge.paid { background:#3a2b0a; color:var(--warn); }
  .changes { color:var(--dim); font-size:12px; margin:8px 0; padding-left:18px; }
  pre { background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:12px; overflow-x:auto; font-size:13px; margin:8px 0 0; white-space:pre-wrap; word-break:break-word; }
  footer { margin-top:48px; color:var(--dim); font-size:12px; border-top:1px solid var(--border); padding-top:16px; }
  footer a { color:var(--dim); }
  code { background:var(--panel); padding:1px 6px; border-radius:4px; font-size:12px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Json<span>aut</span></h1>
  <p class="tag">JSON repair &amp; validation for AI agents. Deterministic fixes are free. LLM fallback for the hard cases: $0.01/call, paid autonomously per-call via x402, charged only on success.</p>

  <label for="input">Broken JSON</label>
  <textarea id="input" spellcheck="false">{'name': 'test', "count": "42", "tags": ["a", "b",],} // agent output</textarea>

  <div class="row">
    <button class="sample" data-s="fence">markdown fences</button>
    <button class="sample" data-s="trunc">truncated</button>
    <button class="sample" data-s="quotes">single quotes</button>
    <button class="sample" data-s="python">python literals</button>
  </div>

  <details>
    <summary>Optional: JSON Schema the output must match</summary>
    <textarea id="schema" spellcheck="false" style="min-height:90px" placeholder='{"type":"object","properties":{"count":{"type":"number"}}}'></textarea>
  </details>

  <div class="row">
    <button id="fix">Fix it</button>
  </div>

  <div class="out" id="out">
    <span class="badge" id="badge"></span>
    <ul class="changes" id="changes"></ul>
    <pre id="result"></pre>
  </div>

  <footer>
    <p>For agents: <a href="/llms.txt">/llms.txt</a> &middot; <a href="/openapi.yaml">/openapi.yaml</a> &middot; MCP endpoint: <code>POST /mcp</code> (tools: repair_json, validate_json)</p>
    <p>Add to Claude Code: <code>claude mcp add --transport http jsonaut [this-origin]/mcp</code></p>
  </footer>
</div>
<script>
(function () {
  var samples = {
    fence: '\\u0060\\u0060\\u0060json\\n{"answer": 42, "reasoning": "because"}\\n\\u0060\\u0060\\u0060',
    trunc: '{"items": [{"id": 1, "name": "first"}, {"id": 2, "na',
    quotes: "{'user': 'alice', 'active': True, 'score': None}",
    python: '{"ok": True, "value": None, "items": (1, 2, 3)}'
  };
  document.querySelectorAll('.sample').forEach(function (b) {
    b.addEventListener('click', function () {
      document.getElementById('input').value = samples[b.dataset.s];
    });
  });
  document.getElementById('fix').addEventListener('click', function () {
    var input = document.getElementById('input').value;
    var schemaText = document.getElementById('schema').value.trim();
    var body = { input: input, allow_llm_fallback: false };
    if (schemaText) {
      try { body.schema = JSON.parse(schemaText); }
      catch (e) { alert('Schema box does not contain valid JSON: ' + e.message); return; }
    }
    var out = document.getElementById('out');
    var badge = document.getElementById('badge');
    var changes = document.getElementById('changes');
    var result = document.getElementById('result');
    out.style.display = 'block';
    badge.className = 'badge';
    badge.textContent = 'working...';
    changes.innerHTML = '';
    result.textContent = '';
    fetch('/v1/repair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.valid) {
        badge.className = 'badge ok';
        badge.textContent = 'fixed via ' + data.method;
        result.textContent = JSON.stringify(data.repaired, null, 2);
      } else {
        badge.className = 'badge ' + (data.llm_required ? 'paid' : 'fail');
        badge.textContent = data.llm_required ? 'needs LLM repair (paid tier)' : 'failed';
        result.textContent = (data.errors || []).join('\\n') || JSON.stringify(data, null, 2);
      }
      (data.changes || []).forEach(function (c) {
        var li = document.createElement('li');
        li.textContent = c;
        changes.appendChild(li);
      });
    }).catch(function (e) {
      badge.className = 'badge fail';
      badge.textContent = 'request error';
      result.textContent = String(e);
    });
  });
})();
</script>
</body>
</html>`;
