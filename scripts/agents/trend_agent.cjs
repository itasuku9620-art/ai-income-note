/**
 * trend_agent.cjs
 * AI×稼ぐ系トレンドキーワード収集エージェント
 * 毎日 06:00 JST 実行
 */

const fs = require("fs");
const path = require("path");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function today() {
  return new Date().toISOString().slice(0, 10);
}

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

async function callClaude(prompt) {
  const { default: fetch } = await import("node-fetch");
  const apiKey = ANTHROPIC_API_KEY.trim().replace(/[\r\n\s]/g, "");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text;
}

async function main() {
  console.log("📊 trend_agent 開始:", new Date().toISOString());

  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が未設定");

  const prompt = `今日の日本のAI副業・note収益化に関するトレンドキーワードを10個提案してください。

条件：
- 「AI × 〇〇で稼ぐ」テーマに関連するキーワード
- 日本語のX（Twitter）でよく検索・使用されそうなもの
- 2026年現在のトレンドを反映
- JSON形式のみで出力（説明不要）

出力フォーマット（JSONのみ）:
{"keywords": ["キーワード1", "キーワード2", ...], "themes": ["テーマ1", "テーマ2", ...], "date": "${today()}"}`;

  const raw = await callClaude(prompt);

  let trendData;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    trendData = JSON.parse(clean);
  } catch {
    // JSON parse失敗時はフォールバック
    trendData = {
      keywords: ["AI副業", "ChatGPT収益化", "note有料記事", "自動化副業", "Claude API活用",
                 "AIライティング", "プロンプト販売", "AI×コンテンツ", "フリーランスAI", "月収10万AI"],
      themes: ["AI副業入門", "自動化収益", "noteマネタイズ"],
      date: today(),
      fallback: true,
    };
  }

  trendData.updated_at = new Date().toISOString();

  const dataDir = path.join(__dirname, "../../data");
  ensureDir(dataDir);
  writeJson(path.join(dataDir, "trend_cache.json"), trendData);

  // PDCA更新
  const pdcaPath = path.join(dataDir, "pdca_trend.json");
  const pdca = readJson(pdcaPath, { cycles: [], total_runs: 0 });
  pdca.total_runs = (pdca.total_runs || 0) + 1;
  pdca.last_run = new Date().toISOString();
  pdca.cycles.push({ date: today(), keywords: trendData.keywords });
  if (pdca.cycles.length > 30) pdca.cycles = pdca.cycles.slice(-30);
  writeJson(pdcaPath, pdca);

  console.log("✅ trend_cache.json 保存完了");
  console.log("キーワード:", trendData.keywords.join(", "));
  console.log("✅ trend_agent 完了:", new Date().toISOString());
}

main().catch(err => { console.error("❌ trend_agent エラー:", err); process.exit(1); });
