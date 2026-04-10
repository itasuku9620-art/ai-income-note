/**
 * research_agent.cjs
 * AI×稼ぐ事例・ツール情報リサーチエージェント
 * 毎日 07:00 JST 実行
 */

const fs = require("fs");
const path = require("path");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function today() { return new Date().toISOString().slice(0, 10); }

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return fallback; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function callClaude(systemPrompt, userPrompt) {
  const { default: fetch } = await import("node-fetch");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text;
}

async function main() {
  console.log("🔍 research_agent 開始:", new Date().toISOString());

  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が未設定");

  // トレンドキャッシュ読み込み
  const trendPath = path.join(__dirname, "../../data/trend_cache.json");
  const trend = readJson(trendPath, { keywords: ["AI副業", "ChatGPT活用", "note収益化"] });
  const keywords = (trend.keywords || []).slice(0, 5).join("、");

  const systemPrompt = `あなたはAI副業・note収益化の専門リサーチャーです。
日本のクリエイターやフリーランスが「AIを使って稼ぐ」ための最新情報をリサーチします。`;

  const userPrompt = `今日のリサーチテーマ: ${keywords}

以下の構成でリサーチレポートをMarkdown形式で作成してください（日本語）:

## 📊 今日のリサーチレポート - ${today()}

### 1. 注目の稼ぎ方事例（3例）
各事例: タイトル、概要、ポイント

### 2. 活用すべきAIツール（3個）
各ツール: 名前、稼ぎ方との関連、具体的な使い方

### 3. noteコンテンツアイデア（5個）
具体的な記事タイトル案（読者が「買いたい」と思えるもの）

### 4. 今日のXツイートヒント
今日使えるフック文・キャッチコピー案（3個）

---
リアルで再現可能な内容を中心に、実際の数字や具体的なステップを含めてください。`;

  const report = await callClaude(systemPrompt, userPrompt);

  const logsDir = path.join(__dirname, "../../logs");
  ensureDir(logsDir);
  fs.writeFileSync(path.join(logsDir, "research_latest.md"), report, "utf-8");
  fs.writeFileSync(path.join(logsDir, `research_${today()}.md`), report, "utf-8");

  // PDCA更新
  const dataDir = path.join(__dirname, "../../data");
  const pdcaPath = path.join(dataDir, "pdca_research.json");
  const pdca = readJson(pdcaPath, { cycles: [], total_runs: 0 });
  pdca.total_runs = (pdca.total_runs || 0) + 1;
  pdca.last_run = new Date().toISOString();
  pdca.cycles.push({ date: today(), keywords, report_length: report.length });
  if (pdca.cycles.length > 30) pdca.cycles = pdca.cycles.slice(-30);
  writeJson(pdcaPath, pdca);

  console.log(`✅ logs/research_latest.md 保存完了 (${report.length}文字)`);
  console.log("✅ research_agent 完了:", new Date().toISOString());
}

main().catch(err => { console.error("❌ research_agent エラー:", err); process.exit(1); });
