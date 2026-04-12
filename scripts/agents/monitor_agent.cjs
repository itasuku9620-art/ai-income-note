/**
 * monitor_agent.cjs
 * 24時間バズ監視エージェント
 * - X API v2 で海外バズツイートを検索
 * - API制限時はClaudeで海外バイラルコンテンツを分析・生成
 * - data/buzz_cache.json に保存
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const X_API_KEY        = process.env.X_API_KEY;
const X_API_SECRET     = process.env.X_API_SECRET;
const X_ACCESS_TOKEN   = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

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

// ─────────────────────────────────────────────
// OAuth 1.0a ヘッダー生成
// ─────────────────────────────────────────────

function buildOAuthHeader(method, url, queryParams = {}) {
  const oauthParams = {
    oauth_consumer_key:     X_API_KEY,
    oauth_nonce:            crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            X_ACCESS_TOKEN,
    oauth_version:          "1.0",
  };

  const allParams = { ...queryParams, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramStr = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join("&");

  const sigBase = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(paramStr)].join("&");
  const sigKey  = `${encodeURIComponent(X_API_SECRET)}&${encodeURIComponent(X_ACCESS_TOKEN_SECRET)}`;
  const signature = crypto.createHmac("sha1", sigKey).update(sigBase).digest("base64");

  oauthParams.oauth_signature = signature;

  return "OAuth " + Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(", ");
}

// ─────────────────────────────────────────────
// X API v2 — 海外バズツイート検索
// ─────────────────────────────────────────────

async function searchXBuzz() {
  const { default: fetch } = await import("node-fetch");

  const queries = [
    "AI side hustle income -is:retweet lang:en",
    "ChatGPT make money automation -is:retweet lang:en",
    "AI passive income 2025 -is:retweet lang:en",
  ];

  const results = [];

  for (const q of queries) {
    const qp = {
      query:        q,
      max_results:  "10",
      "tweet.fields": "public_metrics,created_at,author_id",
      sort_order:   "relevancy",
    };

    const urlBase = "https://api.twitter.com/2/tweets/search/recent";
    const params  = new URLSearchParams(qp).toString();
    const url     = `${urlBase}?${params}`;

    const authHeader = buildOAuthHeader("GET", urlBase, qp);

    const res = await fetch(url, { headers: { Authorization: authHeader } });

    if (!res.ok) {
      console.warn(`⚠️  X API検索スキップ (${res.status}): ${q}`);
      return null; // フォールバックへ
    }

    const json = await res.json();
    if (json.data) {
      const top = json.data
        .sort((a, b) => (b.public_metrics?.like_count || 0) - (a.public_metrics?.like_count || 0))
        .slice(0, 3)
        .map(t => ({
          text:       t.text,
          likes:      t.public_metrics?.like_count   || 0,
          retweets:   t.public_metrics?.retweet_count || 0,
          created_at: t.created_at,
          source:     "x_api",
        }));
      results.push(...top);
    }
  }

  return results.length > 0 ? results : null;
}

// ─────────────────────────────────────────────
// Claude API — 海外バイラルコンテンツ分析
// ─────────────────────────────────────────────

async function callClaude(prompt) {
  const { default: fetch } = await import("node-fetch");
  const apiKey = ANTHROPIC_API_KEY.replace(/[^\x20-\x7E]/g, "");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return data.content[0].text;
}

async function claudeBuzzAnalysis() {
  const prompt = `あなたはAIビジネスリサーチの専門家です。
以下の実在する調査・レポートに基づいたAI副業・収益化コンテンツを生成してください。

【使用可能な実在データ源】
- McKinsey Global Institute「The economic potential of generative AI」2023
- GitHub「The Impact of AI on Developer Productivity」2023（Copilot導入で生産性55%向上）
- Upwork「Future Workforce Report 2024」（AIフリーランサー需要250%増）
- World Economic Forum「Future of Jobs Report 2025」（AI関連職97M件創出予測）
- Stanford HAI「AI Index Report 2024」
- OpenAI公式統計（ChatGPT週間ユーザー1億人超、2024年）
- Anthropic・Google・Microsoft各社の公式発表

以下の形式でJSONのみ出力してください（説明不要）:

{
  "viral_overseas": [
    {
      "text": "上記実在データに基づいた英語ツイート想定文",
      "ja_summary": "完全日本語訳（英語を一切含まず、引用文として使える形式。数値は控えめ・保守的に）",
      "citation": "引用元（必ず上記リストから選ぶ。例: McKinsey GI レポート2023）",
      "likes_estimate": 数値,
      "topic": "トピック名",
      "account_type": "研究者/アナリスト/起業家 など"
    }
  ],
  "viral_stats": [
    {
      "fact": "実在レポートから引用した具体的な数値・事実",
      "source_hint": "レポート名・発行元",
      "citation": "正確な引用元（例: McKinsey GIレポート2023 / WEF Jobs Report 2025）",
      "ja_use": "日本語投稿での活用方法"
    }
  ],
  "hot_topics": ["現在海外でバズっているAI関連トピック（5個）"],
  "date": "${today()}"
}

条件:
- viral_overseas は5件、viral_stats は5件
- 全て実在するレポート・公式発表からの引用のみ
- 誇張なし・数値は原典に忠実に`;

  const raw = await callClaude(prompt);
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

async function main() {
  console.log("🔍 monitor_agent 開始:", new Date().toISOString());

  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が未設定");

  const dataDir = path.join(__dirname, "../../data");
  ensureDir(dataDir);

  // X API検索を試みる
  let xResults = null;
  if (X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_TOKEN_SECRET) {
    console.log("📡 X API でバズツイート検索中...");
    try {
      xResults = await searchXBuzz();
      if (xResults) console.log(`✅ X API: ${xResults.length}件取得`);
      else console.log("⚠️  X API 検索不可 → Claude分析にフォールバック");
    } catch (e) {
      console.warn("⚠️  X API エラー:", e.message, "→ Claude分析にフォールバック");
    }
  }

  // Claude でバイラルコンテンツ分析
  console.log("🤖 Claude で海外バイラルコンテンツを分析中...");
  const claudeData = await claudeBuzzAnalysis();

  // buzz_cache に保存
  const buzzCache = {
    date:           today(),
    updated_at:     new Date().toISOString(),
    method:         xResults ? "x_api+claude" : "claude",
    x_viral:        xResults || [],
    viral_overseas: claudeData.viral_overseas || [],
    viral_stats:    claudeData.viral_stats    || [],
    hot_topics:     claudeData.hot_topics     || [],
  };

  writeJson(path.join(dataDir, "buzz_cache.json"), buzzCache);
  console.log("✅ data/buzz_cache.json 保存完了");

  // 通知追加
  const notifPath = path.join(dataDir, "notifications.json");
  const notifications = readJson(notifPath, []);
  notifications.push({
    id:         `monitor_${today()}_${Date.now()}`,
    type:       "buzz_update",
    title:      `バズ監視更新 - ${today()}`,
    message:    `海外バイラルコンテンツ${claudeData.viral_overseas.length}件・事実データ${claudeData.viral_stats.length}件を収集しました`,
    hot_topics: claudeData.hot_topics,
    created_at: new Date().toISOString(),
    status:     "info",
  });
  writeJson(notifPath, notifications);

  console.log("🔥 ホットトピック:", (claudeData.hot_topics || []).join(", "));
  console.log("✅ monitor_agent 完了:", new Date().toISOString());
}

main().catch(err => { console.error("❌ monitor_agent エラー:", err); process.exit(1); });
