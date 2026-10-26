const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/^\uFEFF/, '');
const script = fs.readFileSync(path.join(__dirname, 'portal-records.js'), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attributes(tag) {
  return Object.fromEntries(Array.from(tag.matchAll(/([\w-]+)="([^"]*)"/g), match => [match[1], decodeHtml(match[2])]));
}

function textContent(markup) {
  return decodeHtml(markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
}

const arrayStart = script.indexOf('  const tools = [');
const arrayEnd = script.indexOf('\n  ];\n\n  const categoryLabels', arrayStart);
if (arrayStart < 0 || arrayEnd < 0) {
  fail('找不到 portal-records.js 的 tools[] 資料');
  process.exit(1);
}

const expressionStart = script.indexOf('[', arrayStart);
const toolsExpression = script.slice(expressionStart, arrayEnd + '\n  ];'.length).trim().replace(/;$/, '');
let tools;
try {
  tools = vm.runInNewContext(`(${toolsExpression})`, Object.create(null), { timeout: 1000 });
} catch (error) {
  fail(`tools[] 無法解析：${error.message}`);
  process.exit(1);
}

const gridStart = html.indexOf('<div class="tool-grid" id="toolGrid"');
const gridEnd = html.indexOf('<p class="tool-empty"', gridStart);
if (gridStart < 0 || gridEnd < 0) {
  fail('找不到快速入口 HTML 區塊');
  process.exit(1);
}
const gridHtml = html.slice(gridStart, gridEnd);
const cards = Array.from(gridHtml.matchAll(/<article\b(?=[^>]*\bdata-tool-card\b)[\s\S]*?<\/article>/g), match => match[0]);
if (tools.length !== 16) fail(`tools[] 預期 16 筆，實際 ${tools.length} 筆`);
if (cards.length !== tools.length) fail(`靜態卡片 ${cards.length} 張，tools[] ${tools.length} 筆`);

const seen = new Set();
const categoryLabelByType = { quiz: '測驗', game: '小遊戲', learning: '課程學習', creative: '創作', utility: '實用' };
for (let index = 0; index < Math.min(cards.length, tools.length); index += 1) {
  const cardHtml = cards[index];
  const openingTag = cardHtml.match(/^<article\b[^>]*>/)?.[0] || '';
  const cardAttrs = attributes(openingTag);
  const tool = tools[index];
  const launchTag = cardHtml.match(/<a\b[^>]*\bdata-tool-launch="[^"]+"[^>]*>/)?.[0] || '';
  const launchAttrs = attributes(launchTag);
  const category = textContent(cardHtml.match(/<div class="tool-copy">\s*<p>([\s\S]*?)<\/p>/)?.[1] || '');
  const title = textContent(cardHtml.match(/<div class="tool-copy">[\s\S]*?<h3>([\s\S]*?)<\/h3>/)?.[1] || '');
  const description = textContent(cardHtml.match(/<h3>[\s\S]*?<\/h3>\s*<span>([\s\S]*?)<\/span>/)?.[1] || '');
  const tags = Array.from(cardHtml.matchAll(/<div class="feature-tags"[^>]*>([\s\S]*?)<\/div>/g), match => Array.from(match[1].matchAll(/<strong>([\s\S]*?)<\/strong>/g), tag => textContent(tag[1])))[0] || [];
  const launchLabel = textContent(launchTag ? cardHtml.slice(cardHtml.indexOf(launchTag), cardHtml.indexOf('</a>', cardHtml.indexOf(launchTag))) : '');

  if (!tool?.id || seen.has(tool.id)) fail(`tools[] 第 ${index + 1} 筆 ID 缺失或重複`);
  seen.add(tool.id);
  if (!/\bdata-tool-card(?:\s|>)/.test(openingTag)) fail(`${tool.id}: 缺少 data-tool-card`);
  if (cardAttrs['data-category'] !== tool.category) fail(`${tool.id}: 分類與 tools[] 不一致`);
  if (cardAttrs['data-title'] !== tool.title || title !== tool.title) fail(`${tool.id}: 標題與 tools[] 不一致`);
  if (cardAttrs['data-keywords'] !== tool.keywords) fail(`${tool.id}: 搜尋關鍵字與 tools[] 不一致`);
  if (category !== tool.categoryLabel) fail(`${tool.id}: 顯示分類與 tools[] 不一致`);
  if (description !== tool.description) fail(`${tool.id}: 簡介與 tools[] 不一致`);
  if (JSON.stringify(tags) !== JSON.stringify(tool.tags)) fail(`${tool.id}: 標籤與 tools[] 不一致`);
  if (launchAttrs['data-tool-launch'] !== tool.id) fail(`${tool.id}: 啟動 ID 與 tools[] 不一致`);
  if (launchAttrs.href !== tool.url) fail(`${tool.id}: 入口網址與 tools[] 不一致`);
  if (launchLabel !== tool.cta) fail(`${tool.id}: 按鈕文案與 tools[] 不一致`);
  if (cardAttrs.class?.includes('is-featured') !== Boolean(tool.featured)) fail(`${tool.id}: featured 狀態與 tools[] 不一致`);

  if (tool.record) {
    if (!cardHtml.includes(`data-record-value="${tool.id}"`) || !cardHtml.includes(`data-record-meta="${tool.id}"`)) {
      fail(`${tool.id}: 缺少測驗紀錄欄位`);
    }
    const meta = textContent(cardHtml.match(new RegExp(`<span data-record-meta="${tool.id}">([\\s\\S]*?)<\\/span>`))?.[1] || '');
    if (meta !== (tool.recordEmptyText || '完成一次後顯示')) fail(`${tool.id}: 測驗紀錄提示與 tools[] 不一致`);
  } else {
    const recordLabel = textContent(cardHtml.match(/<div class="tool-record is-static">[\s\S]*?<strong>已上線<\/strong>\s*<span>([\s\S]*?)<\/span>/)?.[1] || '');
    if (recordLabel !== categoryLabelByType[tool.category]) fail(`${tool.id}: 靜態狀態分類不一致`);
  }
}

if (/toolGrid\.innerHTML\s*=/.test(script)) fail('JavaScript 仍會以 innerHTML 重建入口卡片');
if (!html.includes('src="./scripts/portal-records.js?v=20261026a"')) fail('portal-records.js 快取版本未升至 20261026a');
if ((html.match(/<h1\b/g) || []).length !== 1) fail('首頁 H1 數量不是 1');
if ((html.match(/class="news-item"/g) || []).length !== 27) fail('新聞筆數不是 27');

const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
try {
  if (!jsonLd) throw new Error('找不到 JSON-LD');
  JSON.parse(jsonLd);
} catch (error) {
  fail(`JSON-LD 無法解析：${error.message}`);
}

if (!process.exitCode) {
  console.log(`PASS: ${tools.length} 筆 tools[] 與靜態卡片逐項相符；單一 H1、27 則新聞、JSON-LD 與快取版本通過。`);
}
