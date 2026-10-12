export function isValidRecipient(recipient) {
  return typeof recipient === "string" && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(recipient);
}

// Constant-time comparison: always walks the longer input, so response time does not reveal how much of the token matched.
export function safeEqual(a, b) {
  const encoder = new TextEncoder();
  const x = encoder.encode(String(a));
  const y = encoder.encode(String(b));
  let diff = x.length ^ y.length;
  const length = Math.max(x.length, y.length);
  for (let i = 0; i < length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function makeMessage(report, sender, recipient) {
  if (!isValidRecipient(recipient)) throw new Error("notification_recipient_not_configured");
  return {
    from: { name: "TSY．微光創作｜問題回報", address: sender },
    to: recipient,
    subject: `[微光 Bug 回報 #${report.id}] ${String(report.page || "入口網站").replace(/[\r\n]/g, " ").slice(0, 80)}`,
    text: [
      `回報編號：${report.id}`,
      `時間：${report.created_at}`,
      `頁面／功能：${report.page || "未填"}`,
      `裝置：${report.device || "未填"}`,
      "", "問題描述：", report.description,
      "", `使用者聯絡方式：${report.contact || "未提供（匿名回報）"}`,
      "", "此為網站自動通知；回覆使用者時請使用上方聯絡方式。"
    ].join("\n")
  };
}

export async function processQueue({ rpc, send, sender, recipient }) {
  if (!isValidRecipient(recipient)) throw new Error("notification_recipient_not_configured");
  const reports = await rpc("claim_portal_feedback_notifications", {});
  let sent = 0;
  let failed = 0;
  for (const report of reports) {
    let success = false;
    try {
      await send(makeMessage(report, sender, recipient));
      success = true;
    } catch {
      // Do not persist provider errors: they may include credentials or report data.
      failed++;
    }
    const acknowledged = await rpc("finish_portal_feedback_notification", {
      p_feedback_id: report.id, p_lease_token: report.lease_token,
      p_success: success, p_error: success ? null : "mail_delivery_failed"
    });
    if (!acknowledged) throw new Error("notification_acknowledgement_failed");
    if (success) sent++;
  }
  return { sent, failed };
}

export function createHandler({ token, recipient, process }) {
  return async (request) => {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (!token) return new Response(null, { status: 503 });
    if (!safeEqual(request.headers.get("x-feedback-notify-token") ?? "", token)) {
      return new Response(null, { status: 401 });
    }
    if (!isValidRecipient(recipient)) return new Response(null, { status: 503 });
    try {
      return Response.json(await process());
    } catch {
      return Response.json({ error: "notification_worker_failed" }, { status: 503 });
    }
  };
}
