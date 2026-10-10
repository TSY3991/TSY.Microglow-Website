// Isolated PostgreSQL verification. Install @electric-sql/pglite in a temporary
// directory and set FEEDBACK_TEST_RUNTIME to that directory (no production DB).
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

if (!process.env.FEEDBACK_TEST_RUNTIME) throw new Error("Set FEEDBACK_TEST_RUNTIME to the temporary PGlite runtime directory.");
const require = createRequire(join(process.env.FEEDBACK_TEST_RUNTIME, "package.json"));
const { PGlite } = require("@electric-sql/pglite");
// Verify configuration without reading a real account or any production secret.
const core = await import("../supabase/functions/feedback-notify/core.mjs");
const workerSource = await readFile(new URL("../supabase/functions/feedback-notify/index.ts", import.meta.url), "utf8");
assert.ok(workerSource.includes('Deno.env.get("FEEDBACK_NOTIFY_RECIPIENT")'));
assert.ok(workerSource.includes('auth: { user: recipient, pass: password }'));
assert.equal(core.makeMessage({ id: 1, description: "fictional report" }, "test@example.invalid", "test@example.invalid").to, "test@example.invalid");
const unconfigured = core.createHandler({ token: "test-only-token", process: async () => assert.fail("must not access queue") });
assert.equal((await unconfigured(new Request("https://example.com", { method: "POST", headers: { "x-feedback-notify-token": "test-only-token" } }))).status, 503);
console.log("PASS: recipient comes from secret; missing recipient rejects without accessing queue");
const db = new PGlite();
const query = async sql => (await db.query(sql)).rows;
const value = async sql => Object.values((await query(sql))[0])[0];
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20260722002000_portal_feedback.sql", import.meta.url), "utf8"));
  // A report created before activation must not be backfilled/emailed.
  await db.exec("insert into private.portal_feedback(description) values ('historical report')");
  await db.exec(await readFile(new URL("../supabase/migrations/20261008000100_feedback_notifications.sql", import.meta.url), "utf8"));
  assert.equal(Number(await value("select count(*) from private.portal_feedback_notifications")), 0);
  const submit = "select public.submit_portal_feedback('test-page', 'test-device', 'fictional bug report', null, 'test-agent')";
  assert.equal((await value(submit)).ok, true);
  assert.equal((await value(submit)).duplicate, true);
  assert.equal(Number(await value("select count(*) from private.portal_feedback_notifications")), 1);
  const claim = "select public.claim_portal_feedback_notifications()";
  const [report] = await value(claim);
  assert.equal(report.description, "fictional bug report");
  assert.equal((await value(claim)).length, 0, "active lease cannot be claimed again");
  const finish = (token, success) => `select public.finish_portal_feedback_notification(${report.id}, '${token}', ${success}, 'mail_delivery_failed')`;
  assert.equal(await value(finish("00000000-0000-0000-0000-000000000000", true)), false);
  assert.equal(await value(finish(report.lease_token, false)), true);
  assert.equal((await value(claim)).length, 0, "failure waits before retry");
  await db.exec("update private.portal_feedback_notifications set next_attempt_at = now() - interval '1 second'");
  const [retry] = await value(claim);
  assert.notEqual(retry.lease_token, report.lease_token);
  assert.equal(await value(finish(report.lease_token, true)), false, "stale worker cannot acknowledge retry");
  assert.equal(await value(finish(retry.lease_token, true)), true);
  assert.equal((await value(claim)).length, 0, "sent report stays sent");
  await db.exec("insert into private.portal_feedback(description) values ('fictional failure test')");
  for (let i = 0; i < 5; i++) {
    await db.exec("update private.portal_feedback_notifications set next_attempt_at = now() - interval '1 second' where state <> 'sent'");
    const [failed] = await value(claim);
    assert.equal(await value(`select public.finish_portal_feedback_notification(${failed.id}, '${failed.lease_token}', false, 'mail_delivery_failed')`), true);
  }
  assert.equal(await value("select state from private.portal_feedback_notifications where state <> 'sent'"), "failed");
  assert.equal(await value("select has_function_privilege('anon', 'public.claim_portal_feedback_notifications()', 'execute')"), false);
  assert.equal(await value("select has_function_privilege('authenticated', 'public.finish_portal_feedback_notification(bigint,uuid,boolean,text)', 'execute')"), false);
  assert.equal(await value("select has_function_privilege('service_role', 'public.claim_portal_feedback_notifications()', 'execute')"), true);
  assert.equal(await value("select relrowsecurity from pg_class where oid = 'private.portal_feedback_notifications'::regclass"), true);
  // Check dispatcher logic with local stand-ins, not real Vault/HTTP/cron.
  await db.exec(`
    create schema vault; create schema net; create schema cron;
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    insert into vault.decrypted_secrets values
      ('feedback_notify_token', 'test-only-token'),
      ('feedback_notify_url', 'https://testproject.supabase.co/functions/v1/feedback-notify');
    create table net.test_requests(url text, headers jsonb);
    create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
    returns bigint language plpgsql as $fn$
      begin insert into net.test_requests values (url, headers); return 1; end;
    $fn$;
    create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';
  `);
  const schedule = await readFile(new URL("../supabase/feedback-notification-schedule.sql", import.meta.url), "utf8");
  await db.exec(schedule.replace(/create extension if not exists (pg_net|pg_cron);/g, ""));
  await db.exec("select private.dispatch_feedback_notifications()");
  assert.equal(Number(await value("select count(*) from net.test_requests")), 0);
  await db.exec("insert into private.portal_feedback(description) values ('fictional scheduler test')");
  await db.exec("select private.dispatch_feedback_notifications()");
  assert.equal(Number(await value("select count(*) from net.test_requests")), 1);
  assert.equal(await value("select headers->>'x-feedback-notify-token' from net.test_requests"), "test-only-token");
  await db.exec("update vault.decrypted_secrets set decrypted_secret = 'https://attacker.example.com' where name = 'feedback_notify_url'");
  await assert.rejects(db.exec("select private.dispatch_feedback_notifications()"), /invalid_feedback_notification_url/);
  console.log("PASS: historical reports, duplicate intake, queue/lease/retry, stale acknowledgement, sent state, exhausted attempts, RPC permissions and RLS");
  console.log("PASS: dispatcher SQL with local Vault/HTTP/cron stand-ins (not production infrastructure)");
} finally {
  await db.close();
}
