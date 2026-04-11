/**
 * analytics_agent.cjs
 * フォロワー数・エンゲージメント分析エージェント（週次）
 * 毎週月曜 09:00 JST 実行
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
  const apiKey = ANTHROPIC_API_KEY.replace(/[^\x20-\x7E]/g, "");
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
  console.log("📈 analytics_agent 開始:", new Date().toISOString());

  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が未設定");

  const dataDir = path.join(__dirname, "../../data");
  const history = readJson(path.join(dataDir, "post_history.json"), []);
  const pdcaContent = readJson(path.join(dataDir, "pdca_content.json"), {});

  const recentPosts = history.slice(-14); // 直近2週間
  const totalPosts = history.length;
  const patternCounts = recentPosts.reduce((acc, p) => {
    acc[p.pattern] = (acc[p.pattern] || 0) + 1;
    return acc;
  }, {});

  const prompt = `以下のデータを基に、AI副業noteアカウントの週次分析レポートを作成してください。

【投稿データ】
- 累計投稿数: ${totalPosts}件
- 直近14日間の投稿: ${recentPosts.length}件
- パターン内訳: A=${patternCounts.A || 0}件, B=${patternCounts.B || 0}件, C=${patternCounts.C || 0}件
- 分析日: ${today()}

【分析レポート構成】
## 📊 週次分析レポート - ${today()}

### 投稿状況サマリー

### パターン別パフォーマンス仮説
（A/B/C各パターンの推定効果と改善提案）

### 来週の推奨アクション（3つ）

### コンテンツ改善提案

---
実データがない部分は「次週のデータ収集後に更新」と記載してください。`;

  const report = await callClaude(prompt);

  const logsDir = path.join(__dirname, "../../logs");
  ensureDir(logsDir);
  fs.writeFileSync(path.join(logsDir, `analytics_${today()}.md`), report, "utf-8");
  fs.writeFileSync(path.join(logsDir, "analytics_latest.md"), report, "utf-8");

  const pdcaPath = path.join(dataDir, "pdca_analytics.json");
  const pdca = readJson(pdcaPath, { cycles: [], total_runs: 0 });
  pdca.total_runs = (pdca.total_runs || 0) + 1;
  pdca.last_run = new Date().toISOString();
  pdca.cycles.push({ date: today(), total_posts: totalPosts, pattern_counts: patternCounts });
  if (pdca.cycles.length > 20) pdca.cycles = pdca.cycles.slice(-20);
  writeJson(pdcaPath, pdca);

  console.log("✅ analytics_agent 完了:", new Date().toISOString());
}

main().catch(err => { console.error("❌ analytics_agent エラー:", err); process.exit(1); });
