(function () {
  "use strict";

  const MIN_LENGTH = 12;
  const MAX_LENGTH = 128;
  const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
  const HIBP_TIMEOUT_MS = 4000;

  // 常見弱密碼（含 12 字元以上的常見組合；較短者由長度規則擋下）。
  const COMMON = [
    "123456789012", "1234567890123", "123456789abc", "qwertyuiop12", "qwertyuiopas",
    "qwertyuiop123", "1q2w3e4r5t6y", "1qaz2wsx3edc", "zaq12wsxcde3", "passwordpassword",
    "password1234", "password12345", "password123456", "passw0rd1234", "p@ssw0rd1234",
    "iloveyou1234", "iloveyou12345", "letmein12345", "welcome12345", "admin1234567",
    "administrator", "abcdefghijkl", "abcd12345678", "abc123456789", "aaaaaaaaaaaa",
    "000000000000", "111111111111", "123123123123", "147258369147", "123456abcdef",
    "tsymicroglow", "microglow123", "microglow1234", "microglow2026", "tsy123456789",
    "a12345678901", "qwerty123456", "qwertyuiopasdfghjkl", "asdfghjkl123", "asdfghjklqwe"
  ];

  function allSameOrSequence(value) {
    if (/^(.)\1+$/.test(value)) return true;
    const digits = "01234567890123456789";
    const rdigits = "98765432109876543210";
    const alpha = "abcdefghijklmnopqrstuvwxyz";
    const lower = value.toLowerCase();
    return digits.includes(lower) || rdigits.includes(lower) || alpha.includes(lower);
  }

  // 回傳錯誤訊息；通過則回傳 null。email 選填，用來擋「密碼含帳號名稱」。
  function validateLocal(password, email) {
    if (password.length < MIN_LENGTH) return `密碼至少需要 ${MIN_LENGTH} 個字元。`;
    if (password.length > MAX_LENGTH) return `密碼最多 ${MAX_LENGTH} 個字元。`;
    const lower = password.toLowerCase();
    if (COMMON.includes(lower) || allSameOrSequence(password)) {
      return "這個密碼太常見，請改用較難猜的組合（建議用 4 個以上不相關的詞串成一句）。";
    }
    const local = String(email || "").split("@")[0].toLowerCase();
    if (local.length >= 4 && lower.includes(local)) return "密碼不可包含你的 Email 帳號名稱。";
    return null;
  }

  async function sha1Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-1", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  // HIBP k-anonymity：只送出 SHA-1 前 5 碼。回傳外洩次數；查詢失敗回傳 null（不擋使用者）。
  async function breachCount(password) {
    try {
      if (!window.crypto?.subtle) return null;
      const hash = await sha1Hex(password);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);
      const response = await fetch(HIBP_RANGE_URL + prefix, {
        headers: { "Add-Padding": "true" },
        signal: controller.signal,
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
      window.clearTimeout(timer);
      if (!response.ok) return null;
      const body = await response.text();
      for (const line of body.split("\n")) {
        const [candidate, count] = line.trim().split(":");
        if (candidate === suffix) return Number(count) || 0;
      }
      return 0;
    } catch {
      return null;
    }
  }

  // 完整檢查：回傳錯誤訊息或 null。
  async function validate(password, email) {
    const local = validateLocal(password, email);
    if (local) return local;
    const count = await breachCount(password);
    if (count && count > 0) return "這個密碼曾出現在外洩資料庫中，請改用其他密碼。";
    return null;
  }

  window.MicroglowPasswordPolicy = { MIN_LENGTH, validate, validateLocal, breachCount };
})();
