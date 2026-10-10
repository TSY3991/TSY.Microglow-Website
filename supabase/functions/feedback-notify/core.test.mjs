import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, processQueue, makeMessage } from "./core.mjs";

const RECIPIENT = "test@example.invalid";

const report = { id: 123, lease_token: "lease", created_at: "2026-10-08", page: "test\r\nBcc: attacker@example.com", description: "<script>test</script>", contact: "someone@example.com" };

test("mail recipient comes from trusted configuration and untrusted content stays plain text", () => {
  const message = makeMessage({ ...report, to: "attacker@example.com", recipient: "attacker@example.com" }, RECIPIENT, RECIPIENT);
  assert.equal(message.to, RECIPIENT);
  assert.equal(message.html, undefined);
  assert.equal(message.replyTo, undefined);
  assert.ok(!/[\r\n]/.test(message.subject));
  assert.ok(message.text.includes(report.description));
});

test("unauthorized and malformed requests never access reports", async () => {
  let called = false;
  const handler = createHandler({ token: "test-only-token", recipient: RECIPIENT, process: async () => { called = true; } });
  assert.equal((await handler(new Request("https://example.com", { method: "POST" }))).status, 401);
  assert.equal((await handler(new Request("https://example.com"))).status, 405);
  assert.equal(called, false);
});

test("missing token fails closed", async () => {
  const handler = createHandler({ recipient: RECIPIENT, process: async () => { throw new Error("must not run"); } });
  assert.equal((await handler(new Request("https://example.com", { method: "POST" }))).status, 503);
});

test("valid worker token is accepted", async () => {
  const handler = createHandler({ token: "test-only-token", recipient: RECIPIENT, process: async () => ({ sent: 0, failed: 0 }) });
  const response = await handler(new Request("https://example.com", { method: "POST", headers: { "x-feedback-notify-token": "test-only-token" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: 0, failed: 0 });
});

test("authorized worker sends and acknowledges the matching lease", async () => {
  let ack;
  const rpc = async (name, args) => name.startsWith("claim") ? [report] : (ack = args, true);
  const result = await processQueue({ rpc, sender: RECIPIENT, recipient: RECIPIENT, send: async message => assert.equal(message.to, RECIPIENT) });
  assert.deepEqual(result, { sent: 1, failed: 0 });
  assert.equal(ack.p_lease_token, report.lease_token);
  assert.equal(ack.p_success, true);
});

test("SMTP failure schedules retry without leaking provider errors", async () => {
  let ack;
  const rpc = async (name, args) => name.startsWith("claim") ? [report] : (ack = args, true);
  assert.deepEqual(await processQueue({ rpc, sender: RECIPIENT, recipient: RECIPIENT, send: async () => { throw new Error("secret-password"); } }), { sent: 0, failed: 1 });
  assert.equal(ack.p_success, false);
  assert.equal(ack.p_error, "mail_delivery_failed");
});

test("acknowledgement failure remains observable", async () => {
  const rpc = async name => name.startsWith("claim") ? [report] : false;
  await assert.rejects(processQueue({ rpc, sender: RECIPIENT, recipient: RECIPIENT, send: async () => {} }), /acknowledgement_failed/);
});

test("empty queue sends nothing", async () => {
  assert.deepEqual(await processQueue({ rpc: async () => [], sender: RECIPIENT, recipient: RECIPIENT, send: async () => assert.fail("no reports") }), { sent: 0, failed: 0 });
});

for (const recipient of [undefined, "", "invalid", "a@example.com,b@example.com", "a@example.com\r\nBcc: b@example.com", "Name <a@example.com>"]) {
  test("missing or invalid recipient fails before accessing the queue: " + JSON.stringify(recipient), async () => {
    let called = false;
    const handler = createHandler({ token: "test-only-token", recipient, process: async () => { called = true; } });
    const response = await handler(new Request("https://example.com", { method: "POST", headers: { "x-feedback-notify-token": "test-only-token" } }));
    assert.equal(response.status, 503);
    assert.equal(called, false);
    await assert.rejects(processQueue({ recipient, sender: RECIPIENT, rpc: async () => assert.fail("must not claim"), send: async () => assert.fail("must not send") }), /recipient_not_configured/);
  });
}

test("changing trusted recipient also changes the notification destination", () => {
  assert.equal(makeMessage(report, "other@example.com", "other@example.com").to, "other@example.com");
});
