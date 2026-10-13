"use strict";

// Safety tests for the PROPOSED RA link normalization migration
// (supabase/proposed/2026-10-12_ra_link_normalization*.sql). Nothing here touches a real database.
//
// Static checks always run. The behavioral checks run the real SQL against a throwaway local
// PostgreSQL cluster when initdb/pg_ctl/psql are available (and we may run them), and are skipped
// with a note otherwise.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const dir = path.join(REPO_DIR, "supabase/proposed");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const migration = read("2026-10-12_ra_link_normalization.sql");
const dryRun = read("2026-10-12_ra_link_normalization_dry_run.sql");
const rollback = read("2026-10-12_ra_link_normalization_rollback.sql");
const verify = read("2026-10-12_ra_link_normalization_verify.sql");
const exceptions = read("2026-10-12_ra_link_normalization_exceptions.sql");

const stripComments = (sql) => sql.replace(/--.*$/gm, "");

function staticChecks() {
  const m = stripComments(migration);

  // Exactly one UPDATE, against public.events, writing only the two link columns.
  const updates = m.match(/\bupdate\s+public\.events\b[\s\S]*?;/gi) || [];
  assert.strictEqual(updates.length, 1, "exactly one UPDATE on public.events");
  const setClause = /\bset\b([\s\S]*?)\bfrom\b/i.exec(updates[0])[1];
  const setCols = setClause.split(",").map((s) => s.split("=")[0].trim()).sort();
  assert.deepStrictEqual(setCols, ["event_url", "ticket_url"], "only event_url and ticket_url are written");

  // Scope and concurrency guards live on the UPDATE itself.
  assert.ok(/e\.source\s*=\s*'Resident Advisor'/.test(updates[0]), "UPDATE is scoped to source = 'Resident Advisor'");
  assert.ok(/e\.external_id\s*=\s*p\.external_id/.test(updates[0]), "UPDATE matches the planned external_id");
  assert.ok(/e\.event_url\s+is not distinct from p\.event_url/i.test(updates[0]), "UPDATE re-checks event_url (concurrent edit guard)");
  assert.ok(/e\.ticket_url\s+is not distinct from p\.ticket_url/i.test(updates[0]), "UPDATE re-checks ticket_url (concurrent edit guard)");
  assert.ok(/external_id\s*~\s*'\^ra-\[0-9\]\+\$'/.test(m), "numeric ra- id required");

  // No destructive or unrelated statements.
  for (const bad of [/\bdelete\s+from\b/i, /\btruncate\b/i, /\bdrop\s+table\b/i, /\balter\s+table\s+public\.events\b/i, /\binsert\s+into\s+public\.events\b/i]) {
    assert.ok(!bad.test(m), `migration must not contain ${bad}`);
  }
  assert.ok(/begin;/i.test(m) && /commit;/i.test(m), "runs in one transaction");
  assert.ok(/raise exception/i.test(m), "has a row-count cap that aborts the run");
  assert.ok(/enable row level security/i.test(m), "backup table has RLS enabled");
  assert.ok(/on conflict \(id\) do nothing/i.test(m), "backup keeps the first (original) values on re-run");

  // Dry-run, verify: no writes at all.
  for (const [name, sql] of [["dry-run", dryRun], ["verify", verify]]) {
    assert.ok(!/\b(insert|update|delete|truncate|drop|alter|create)\b/i.test(stripComments(sql)), `${name} is SELECT-only`);
  }
  // Rollback only restores rows still at the migrated values.
  const r = stripComments(rollback);
  assert.ok(/e\.event_url\s+is not distinct from b\.new_event_url/i.test(r) && /e\.ticket_url\s+is not distinct from b\.new_ticket_url/i.test(r), "rollback is guarded");
  const x = stripComments(exceptions);
  const xu = x.match(/\bupdate\s+public\.events\b[\s\S]*?;/gi) || [];
  assert.strictEqual(xu.length, 1, "exception operation: exactly one UPDATE");
  const xset = /\bset\b([\s\S]*?)\bfrom\b/i.exec(xu[0])[1].split(",").map((q) => q.split("=")[0].trim()).sort();
  assert.deepStrictEqual(xset, ["event_url", "ticket_url"]);
  assert.ok(/is not distinct from p\.event_url/i.test(xu[0]) && /is not distinct from p\.ticket_url/i.test(xu[0]), "exception operation re-checks current links");
  assert.ok(/'ra-2552946'/.test(x) && /'ra-2553785'/.test(x) && /e\.title = v\.title/.test(x) && /e\.ticket_url = v\.foreign_ticket/.test(x), "exception operation is pinned to the two rows by id, title and foreign link");
  assert.ok(/n not in \(0, 2\)/.test(x), "exception operation aborts unless it plans 0 or 2 rows");
  console.log("PASS: migration is one guarded, scoped UPDATE of only event_url/ticket_url; dry-run and verify are SELECT-only");
}

function findPgBin() {
  const candidates = [process.env.PG_BIN, "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin", "/usr/lib/postgresql/17/bin"].filter(Boolean);
  return candidates.find((d) => fs.existsSync(path.join(d, "initdb")) && fs.existsSync(path.join(d, "pg_ctl")));
}

const FIXTURE = `
create type event_status as enum ('pending_review','approved','rejected');
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, status event_status not null default 'pending_review',
  start_date date, end_date date, time_display text,
  source text, external_id text, event_url text, ticket_url text, internal_note text, venue_name_raw text,
  updated_at timestamptz default now()
);
create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger events_set_updated_at before update on public.events for each row execute function set_updated_at();
insert into public.events (title, description, status, start_date, time_display, source, external_id, event_url, ticket_url) values
 ('t1 fill',            'd1', 'approved',       '2026-10-20', '9:00 PM', 'Resident Advisor', 'ra-1001', null, null),
 ('t2 fill+clear',      'd2', 'approved',       '2026-10-20', '9:00 PM', 'Resident Advisor', 'ra-1002', null, 'https://ra.co/events/1002'),
 ('t3 generic',         'd3', 'approved',       '2026-10-20', '9:00 PM', 'Resident Advisor', 'ra-1003', 'https://seatgeek.com', null),
 ('t4 genuine ticket',  'd4', 'pending_review', '2026-10-20', null,      'Resident Advisor', 'ra-1004', null, 'https://dice.fm/event/abc'),
 ('t5 clear only',      'd5', 'approved',       '2026-10-20', '9:00 PM', 'Resident Advisor', 'ra-1005', 'https://ra.co/events/1005', 'https://www.ra.co/events/1005/'),
 ('t6 held other ra',   'd6', 'approved',       '2026-10-20', '9:00 PM', 'Resident Advisor', 'ra-1006', null, 'https://ra.co/events/9999'),
 ('t7 specific other',  'd7', 'approved',       '2026-10-20', '9:00 PM', 'Resident Advisor', 'ra-1007', 'https://venue.example/shows/7', 'https://tix.example/7'),
 ('t8 held mixed',      'd8', 'approved',       '2026-10-20', '9:00 PM', 'Resident Advisor', 'ra-1008', 'https://venue.example/shows/8', 'https://ra.co/events/1008'),
 ('t9 non-RA',          'd9', 'approved',       '2026-10-20', '9:00 PM', 'Trinosophes',      'ra-1009', null, 'https://ra.co/events/1009'),
 ('t10 mixed source',   'd10','approved',       '2026-10-20', '9:00 PM', 'Paxahau / Resident Advisor', 'ra-1010', null, null),
 ('t11 no numeric id',  'd11','approved',       '2026-10-20', '9:00 PM', 'Resident Advisor', 'manual-1', null, null),
 ('t12 rejected row',   'd12','rejected',       '2026-10-20', '9:00 PM', 'Resident Advisor', 'ra-1012', null, null);
insert into public.events (title, description, status, start_date, time_display, source, external_id, event_url, ticket_url, internal_note) values
 ('House À La Mode', 'dA', 'approved', '2026-10-09', '10:00 PM', 'Resident Advisor', 'ra-2552946', null, 'https://ra.co/events/2545734', 'RA_PROVENANCE | v1 | ra_id=ra-2552946 | ra_url=https://ra.co/events/2552946 | ra_fields=title,date,venueName,url | status=unresolved'),
 ('Industry Sunday', 'dB', 'approved', '2026-10-11', '9:00 PM',  'Resident Advisor', 'ra-2553785', null, 'https://ra.co/events/2554757', 'RA_PROVENANCE | v1 | ra_id=ra-2553785 | ra_url=https://ra.co/events/2553785 | ra_fields=title,date,venueName,url | status=unresolved'),
 ('Foggy Sunday',    'dC', 'approved', '2026-10-11', '10:00 PM', 'Resident Advisor', 'ra-2554757', null, 'https://ra.co/events/2554757', 'RA_PROVENANCE | v1 | ra_id=ra-2554757 | ra_url=https://ra.co/events/2554757 | ra_fields=title,date,venueName,url | status=unresolved');
`;

function behavioralChecks() {
  const bin = findPgBin();
  const psqlPath = bin && fs.existsSync(path.join(bin, "psql")) ? path.join(bin, "psql") : "psql";
  if (!bin) { console.log("SKIP: behavioral migration checks (no local PostgreSQL binaries found)"); return; }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-mig-"));
  const data = path.join(root, "data");
  const sock = path.join(root, "sock");
  fs.mkdirSync(sock);
  const asUser = process.getuid && process.getuid() === 0;
  if (asUser) { try { fs.chmodSync(root, 0o777); fs.chmodSync(sock, 0o777); } catch {} }
  const run = (cmd, args, opts = {}) => {
    const full = asUser ? ["-u", "nobody", cmd, ...args] : [cmd, ...args];
    const exe = asUser ? "setpriv" : cmd;
    const a = asUser ? ["--reuid=nobody", "--regid=nogroup", "--clear-groups", cmd, ...args] : args;
    return spawnSync(exe, a, { encoding: "utf8", env: { ...process.env, PGHOST: sock, PGUSER: "postgres", LANG: "C", LC_ALL: "C" }, ...opts });
  };
  const probe = run(path.join(bin, "initdb"), ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-sync"]);
  if (probe.status !== 0) { console.log("SKIP: behavioral migration checks (could not initialise a throwaway cluster: " + (probe.stderr || probe.error || "").toString().trim().split("\n")[0] + ")"); return; }
  const start = run(path.join(bin, "pg_ctl"), ["-D", data, "-o", `-c listen_addresses='' -c unix_socket_directories='${sock}'`, "-w", "-l", path.join(root, "log"), "start"]);
  if (start.status !== 0) { console.log("SKIP: behavioral migration checks (could not start a throwaway cluster)"); return; }
  try {
    const sql = (text) => {
      const f = path.join(root, `q${Math.random().toString(36).slice(2)}.sql`);
      fs.writeFileSync(f, text); fs.chmodSync(f, 0o644);
      const r = run(psqlPath, ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-d", "postgres", "-f", f]);
      if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}\n${r.stdout}`);
      return r.stdout;
    };
    const rows = () => sql("select external_id, coalesce(event_url,'<null>'), coalesce(ticket_url,'<null>'), status, description from public.events order by external_id;").trim().split("\n").map((l) => l.split("|"));
    const byExt = (list) => Object.fromEntries(list.map((r) => [r[0], r]));

    sql(FIXTURE);
    const before = byExt(rows());

    // Dry-run block 1 reports the plan without writing.
    const block1 = dryRun.split(/-- =====/)[1].replace(/^[^\n]*\n/, "");
    const summary = sql(block1).trim().split("|").map(Number);
    // total, fills, replacements, ticket corrections, unchanged, exceptions, rows_that_would_change
    assert.deepStrictEqual(summary, [12, 5, 1, 3, 1, 4, 7], "dry-run summary counts");
    assert.deepStrictEqual(byExt(rows()), before, "dry-run wrote nothing");

    // Concurrency guard: a row edited after planning is skipped, not overwritten.
    const injected = migration.replace(/update public\.events e\n/i, "update public.events set ticket_url = 'https://tix.example/edited-concurrently' where external_id = 'ra-1002';\nupdate public.events e\n");
    assert.notStrictEqual(injected, migration, "guard test hook applied");
    sql(injected);
    let after = byExt(rows());
    assert.strictEqual(after["ra-1002"][1], "<null>", "concurrently edited row event_url untouched");
    assert.strictEqual(after["ra-1002"][2], "https://tix.example/edited-concurrently", "concurrent edit preserved");

    // Reset that row and run the real migration; then once more (idempotency).
    sql(rollback.replace(/^-- drop table.*$/m, ""));
    sql("update public.events set ticket_url = 'https://ra.co/events/1002' where external_id = 'ra-1002'; delete from public.ra_link_normalization_backup_20261012;");
    assert.deepStrictEqual(byExt(rows()), before, "fixture restored before the real run");
    sql(migration);
    after = byExt(rows());
    const ra = (id) => after[id];
    assert.deepStrictEqual([ra("ra-1001")[1], ra("ra-1001")[2]], ["https://ra.co/events/1001", "<null>"], "fill");
    assert.deepStrictEqual([ra("ra-1002")[1], ra("ra-1002")[2]], ["https://ra.co/events/1002", "<null>"], "fill + clear same-RA ticket_url");
    assert.deepStrictEqual([ra("ra-1003")[1], ra("ra-1003")[2]], ["https://ra.co/events/1003", "<null>"], "generic homepage replaced");
    assert.deepStrictEqual([ra("ra-1004")[1], ra("ra-1004")[2]], ["https://ra.co/events/1004", "https://dice.fm/event/abc"], "genuine ticket preserved");
    assert.deepStrictEqual([ra("ra-1005")[1], ra("ra-1005")[2]], ["https://ra.co/events/1005", "<null>"], "existing RA event_url kept; same-RA ticket_url cleared (www/trailing slash)");
    for (const id of ["ra-1006", "ra-1007", "ra-1008", "ra-1009", "ra-1010", "manual-1", "ra-2552946", "ra-2553785"]) {
      assert.deepStrictEqual(after[id], before[id], `${id} untouched (held / specific link / non-RA / out of scope)`);
    }
    assert.strictEqual(ra("ra-1012")[1], "https://ra.co/events/1012", "rejected RA row follows the same rule");
    for (const id of Object.keys(before)) {
      assert.strictEqual(after[id][3], before[id][3], `${id} status unchanged`);
      assert.strictEqual(after[id][4], before[id][4], `${id} description unchanged`);
    }
    const snapshot = JSON.stringify(after);
    sql(migration);
    assert.strictEqual(JSON.stringify(byExt(rows())), snapshot, "second run changes nothing (idempotent)");
    assert.strictEqual(sql("select count(*) from public.ra_link_normalization_backup_20261012;").trim(), "7", "backup holds exactly the changed rows");
    console.log("PASS: migration fills, replaces generic, clears only the same-RA ticket_url, keeps genuine tickets, holds ambiguous rows, never touches non-RA rows, is idempotent and skips concurrently edited rows");

    // The two held rows: the separately guarded operation resolves exactly them.
    const exc = (x) => x.replace(/^[^\n]*\n/, "");
    const block4 = dryRun.split(/-- =====/)[4].replace(/^[^\n]*\n/, "");
    const preview = sql(block4).trim().split("\n");
    assert.strictEqual(preview.length, 2, "dry-run block 4 previews exactly the two held rows");
    assert.ok(preview.every((l) => l.includes("|t|")), "provenance records each row's own RA url");
    // Guard: all-or-nothing. If either row no longer matches (here: a title edited by a human) the
    // whole operation aborts and nothing is written.
    const preExc = byExt(rows());
    sql("update public.events set title = 'Renamed by a human' where external_id = 'ra-2553785';");
    const rowsBeforeAbort = JSON.stringify(byExt(rows()));
    assert.throws(() => sql(exceptions), /expected 0 or 2/, "mismatch aborts the operation");
    assert.strictEqual(JSON.stringify(byExt(rows())), rowsBeforeAbort, "an aborted run writes nothing");
    sql("update public.events set title = 'Industry Sunday' where external_id = 'ra-2553785';");
    sql(exceptions);
    const afterExc = byExt(rows());
    assert.deepStrictEqual([afterExc["ra-2552946"][1], afterExc["ra-2552946"][2]], ["https://ra.co/events/2552946", "<null>"], "verified row: own event page set, foreign RA ticket_url cleared");
    assert.deepStrictEqual([afterExc["ra-2553785"][1], afterExc["ra-2553785"][2]], ["https://ra.co/events/2553785", "<null>"], "second held row resolved once its title matches");
    assert.deepStrictEqual(afterExc["ra-2554757"], preExc["ra-2554757"], "the foreign event's own row is untouched by the exception operation");
    for (const id of ["ra-2552946", "ra-2553785"]) {
      assert.strictEqual(afterExc[id][3], before[id][3], `${id} status unchanged`);
      assert.strictEqual(afterExc[id][4], before[id][4], `${id} description unchanged`);
    }
    const snap2 = JSON.stringify(afterExc);
    sql(exceptions);
    assert.strictEqual(JSON.stringify(byExt(rows())), snap2, "exception operation is idempotent");
    assert.strictEqual(sql("select count(*) from public.ra_link_normalization_backup_20261012;").trim(), "9", "backup now also holds the two exception rows");
    console.log("PASS: exception operation resolves exactly the two held rows when title/id/foreign-link/provenance match, aborts on any mismatch, leaves other fields and the foreign event alone, and is idempotent");

    // Verification queries: checks 2, 3 and 4 return nothing for non-held rows.
    const v = verify.split(/\n-- \d\. /).slice(1);
    assert.strictEqual(sql(v[2].replace(/^[^\n]*\n/, "")).trim(), "", "verify 3: genuine tickets preserved");
    assert.strictEqual(sql(v[3].replace(/^[^\n]*\n/, "")).trim(), "", "verify 4: only the link columns changed");
    assert.strictEqual(sql(v[5].replace(/^[^\n]*\n/, "")).trim(), "0", "verify 6: a re-run would change nothing");
    console.log("PASS: post-migration verification queries are clean");

    // Rollback restores originals.
    sql(rollback.replace(/^-- drop table.*$/m, ""));
    assert.deepStrictEqual(byExt(rows()), before, "rollback restores every changed row");
    console.log("PASS: rollback restores the original link values");
  } finally {
    run(path.join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"]);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

staticChecks();
try { behavioralChecks(); } catch (err) { console.error("FAIL:", err); process.exit(1); }
