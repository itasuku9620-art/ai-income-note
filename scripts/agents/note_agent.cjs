/**
 * note_agent.cjs
 * note記事下書き生成エージェント
 * 毎日 11:00 JST 実行
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
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text;
}

async function main() {
  console.log("📝 note_agent 開始:", new Date().toISOString());

  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が未設定");

  // トレンド・リサーチ読み込み
  const trendData = readJson(path.join(__dirname, "../../data/trend_cache.json"), {});
  const researchPath = path.join(__dirname, "../../logs/research_latest.md");
  const researchContext = fs.existsSync(researchPath)
    ? fs.readFileSync(researchPath, "utf-8").slice(0, 1500)
    : "AI副業・note収益化のコンテンツ";

  const keywords = (trendData.keywords || ["AI副業", "ChatGPT活用", "note収益化"]).slice(0, 3).join("、");

  const systemPrompt = `あなたはAI副業・note収益化専門のコンテンツライターです。
日本のフリーランス・個人事業主・副業希望者向けに、実践的で再現性の高いnote記事を書きます。

【文体・方針】
- 読者目線、具体的数字・ステップ必須
- 信頼性のある事例ベース
- 2,000〜3,500文字
- noteのSEOを意識したタイトル
- 無料部分で価値を届け、有料部分で詳細テンプレート・プロンプトを提供`;

  const userPrompt = `今日のテーマキーワード: ${keywords}

以下のテンプレート構成でnote記事の下書きを作成してください:

---
title: （具体的な数字・読者の悩み解決を含むタイトル）
tags: AI, 副業, 稼ぐ, ChatGPT, 自動化
price: 300
---

（リード文：この記事で何が得られるか・誰向けか・100文字程度）

## この記事を読んで得られること

## なぜ今AIで稼ぐのか（問題提起）

## 具体的な方法（解決策）

## 実例・ステップ解説

## まとめ・行動呼びかけ

---
※有料エリア（ここから）

## プロンプト集・テンプレート
（実際に使えるプロンプト3〜5個）

---
参考情報: ${researchContext.slice(0, 500)}`;

  const article = await callClaude(systemPrompt, userPrompt);

  const pendingDir = path.join(__dirname, "../../pending_approval");
  const outputsDir = path.join(__dirname, "../../outputs");
  ensureDir(pendingDir);
  ensureDir(outputsDir);

  const filename = `note_${today()}.md`;
  fs.writeFileSync(path.join(pendingDir, filename), article, "utf-8");
  fs.writeFileSync(path.join(outputsDir, filename), article, "utf-8");

  // 通知追加
  const notifPath = path.join(__dirname, "../../data/notifications.json");
  const notifications = readJson(notifPath, []);
  notifications.push({
    id: `note_${today()}_${Date.now()}`,
    type: "note_approval_required",
    title: `note記事承認待ち - ${today()}`,
    message: "note_agentが記事の下書きを生成しました。ポータルで確認してください。",
    pending_file: filename,
    created_at: new Date().toISOString(),
    status: "pending",
  });
  fs.writeFileSync(notifPath, JSON.stringify(notifications, null, 2), "utf-8");

  // PDCA更新
  const pdcaPath = path.join(__dirname, "../../data/pdca_note.json");
  const pdca = readJson(pdcaPath, { cycles: [], total_runs: 0 });
  pdca.total_runs = (pdca.total_runs || 0) + 1;
  pdca.last_run = new Date().toISOString();
  pdca.cycles.push({ date: today(), keywords, article_length: article.length });
  if (pdca.cycles.length > 30) pdca.cycles = pdca.cycles.slice(-30);
  writeJson(pdcaPath, pdca);

  console.log(`✅ pending_approval/${filename} 保存完了 (${article.length}文字)`);
  console.log("✅ note_agent 完了:", new Date().toISOString());
}

main().catch(err => { console.error("❌ note_agent エラー:", err); process.exit(1); });
