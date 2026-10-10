// SMTP uses TLS port 465: Supabase blocks outgoing ports 25 and 587.
import nodemailer from "npm:nodemailer@10.0.15";
import { createHandler, processQueue } from "./core.mjs";

const token = Deno.env.get("FEEDBACK_NOTIFY_TOKEN");
const recipient = Deno.env.get("FEEDBACK_NOTIFY_RECIPIENT");
const password = Deno.env.get("FEEDBACK_GMAIL_APP_PASSWORD");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const transport = nodemailer.createTransport({
  host: "smtp.gmail.com", port: 465, secure: true,
  auth: { user: recipient, pass: password },
  connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000
});

async function rpc(name: string, args: unknown) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceKey!, Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("notification_database_failed");
  return response.json();
}

Deno.serve(createHandler({
  token,
  recipient,
  process: async () => {
    // Fail before claiming a lease if account configuration is incomplete.
    if (!password || !serviceKey || !supabaseUrl) throw new Error("notification_not_configured");
    return processQueue({
      rpc, sender: recipient, recipient,
      send: async (message: Parameters<typeof transport.sendMail>[0]) => { await transport.sendMail(message); }
    });
  }
}));
