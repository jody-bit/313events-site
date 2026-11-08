// Durable per-field ledger for automated enrichment writes (#312). Writes to public.enrichment_change_log, which exists only
// after the owner approves supabase/proposed/enrichment_change_log.sql. Until then createTableLedger() returns null and
// callers run WITHOUT a durable ledger (the capped source_runs.session_data summary is explicitly non-durable).
// Append-only: this module only ever POSTs and GETs; it never PATCHes or DELETEs.
"use strict";

function createTableLedger({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, fetchFn = fetch, enabled = process.env.ENRICHMENT_LEDGER_TABLE === "1" } = {}) {
  if (!enabled || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
  const base = `${SUPABASE_URL}/rest/v1/enrichment_change_log`;
  return {
    async record(records) {
      if (!records.length) return;
      const rows = records.map((r) => ({ event_id: r.event_id, field: r.field, before_value: r.before === null ? null : String(r.before),
        after_value: r.after === null ? null : String(r.after), source: r.source, run_id: r.run_id, status: r.status, created_at: r.at }));
      const res = await fetchFn(base, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(rows) });
      if (!res.ok) throw new Error(`ledger POST ${res.status}`);
    },
    async hasProposal(key) {
      const [event_id, field, ...rest] = key.split("|");
      const after = rest.join("|");
      const q = `${base}?select=id&status=eq.proposed&event_id=eq.${encodeURIComponent(event_id)}&field=eq.${encodeURIComponent(field)}&after_value=eq.${encodeURIComponent(after)}&limit=1`;
      const res = await fetchFn(q, { headers });
      if (!res.ok) throw new Error(`ledger GET ${res.status}`);
      return (await res.json()).length > 0;
    },
  };
}

module.exports = { createTableLedger };
