/**
 * monetization_agent.cjs
 * 収益化KPI・改善提案エージェント（週次）
 * 毎週日曜 10:00 JST 実行
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
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text;
}

async function main() {
  console.log("💰 monetization_agent 開始:", new Date().toISOString());

  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が未設定");

  const dataDir = path.join(__dirname, "../../data");
  const sharedMemory = readJson(path.join(dataDir, "shared_memory.json"), {});
  const history = readJson(path.join(dataDir, "post_history.json"), []);

  // 過去KPIがあれば読み込み
  const kpiPath = path.join(dataDir, "kpi_history.json");
  const kpiHistory = readJson(kpiPath, []);

  const prompt = `AI副業・note収益化アカウントの今週の収益化KPIレポートを作成してください。

【現状データ】
- 累計X投稿数: ${history.length}件
- 開始からの経過データ: ${JSON.stringify(sharedMemory).slice(0, 300)}
- 分析日: ${today()}

【ロードマップ参考】
- 2026年4〜6月: システム構築・フォロワー100人目標
- 2026年7〜9月: 有料記事開始・メンバーシップ開設・フォロワー500人・月収1〜3万円
- 2026年10月〜: メンバーシップ収益安定・月収5〜10万円

【レポート構成】
## 💰 収益化KPIレポート - ${today()}

### 現フェーズ判定と進捗

### KPI達成度チェック
（フォロワー数目標・投稿頻度・note記事数）

### 今週の収益化アクション優先順位（TOP3）

### 来週のコンテンツ戦略提案

### 中長期ロードマップ確認

---
具体的な数値目標と行動計画を含めてください。`;

  const report = await callClaude(prompt);

  const logsDir = path.join(__dirname, "../../logs");
  ensureDir(logsDir);
  fs.writeFileSync(path.join(logsDir, `monetization_${today()}.md`), report, "utf-8");
  fs.writeFileSync(path.join(logsDir, "monetization_latest.md"), report, "utf-8");

  // KPI履歴に記録
  kpiHistory.push({
    date: today(),
    total_posts: history.length,
    report_generated: true,
  });
  if (kpiHistory.length > 52) kpiHistory.shift(); // 1年分
  writeJson(kpiPath, kpiHistory);

  const pdcaPath = path.join(dataDir, "pdca_monetization.json");
  const pdca = readJson(pdcaPath, { cycles: [], total_runs: 0 });
  pdca.total_runs = (pdca.total_runs || 0) + 1;
  pdca.last_run = new Date().toISOString();
  pdca.cycles.push({ date: today(), total_posts: history.length });
  if (pdca.cycles.length > 20) pdca.cycles = pdca.cycles.slice(-20);
  writeJson(pdcaPath, pdca);

  console.log("✅ monetization_agent 完了:", new Date().toISOString());
}

main().catch(err => { console.error("❌ monetization_agent エラー:", err); process.exit(1); });
