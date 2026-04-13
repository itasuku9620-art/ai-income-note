/**
 * x_post.cjs
 * X（Twitter）API v2 投稿スクリプト
 * OAuth 1.0a 認証
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const clean = (s) => (s || "").replace(/[^\x20-\x7E]/g, "").trim();

const X_API_KEY             = clean(process.env.X_API_KEY);
const X_API_SECRET          = clean(process.env.X_API_SECRET);
const X_ACCESS_TOKEN        = clean(process.env.X_ACCESS_TOKEN);
const X_ACCESS_TOKEN_SECRET = clean(process.env.X_ACCESS_TOKEN_SECRET);
const SELECTED_PATTERN      = process.env.SELECTED_PATTERN;

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ─────────────────────────────────────────────
// 二重投稿チェック
// ─────────────────────────────────────────────

function checkAlreadyPosted() {
  const flagPath = path.join(__dirname, `../../data/x_posted_${today()}.flag`);
  if (fs.existsSync(flagPath)) {
    console.log(`⚠️ 本日（${today()}）はすでに投稿済みです。スキップします。`);
    return true;
  }
  return false;
}

function markAsPosted() {
  const flagPath = path.join(__dirname, `../../data/x_posted_${today()}.flag`);
  fs.writeFileSync(flagPath, new Date().toISOString(), "utf-8");
  console.log(`✅ 投稿フラグを作成: ${path.basename(flagPath)}`);
}

// ─────────────────────────────────────────────
// 投稿テキスト読み込み
// ─────────────────────────────────────────────

function loadTweetText() {
  const pattern = (SELECTED_PATTERN || "A").toUpperCase();
  const validPatterns = ["A", "B", "C"];

  if (!validPatterns.includes(pattern)) {
    throw new Error(`不正なパターン指定: ${pattern}（A/B/C のいずれかを指定）`);
  }

  const filePath = path.join(__dirname, `../../data/x_pattern_${pattern}.txt`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`パターンファイルが見つかりません: ${filePath}`);
  }

  const text = fs.readFileSync(filePath, "utf-8").trim();
  if (!text) {
    throw new Error(`パターン${pattern}のファイルが空です`);
  }

  // 140文字を超えていたら切り捨て
  const chars = [...text];
  if (chars.length > 140) {
    console.log(`⚠️ 140文字超過（${chars.length}字）→ 切り捨て処理`);
    return chars.slice(0, 140).join("");
  }

  console.log(`📄 パターン${pattern}を読み込み（${chars.length}文字）`);
  return text;
}

// ─────────────────────────────────────────────
// OAuth 1.0a 署名生成
// ─────────────────────────────────────────────

function buildOAuthHeader(method, url, params) {
  const oauthParams = {
    oauth_consumer_key: X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  const allParams = { ...params, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramStr = sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join("&");

  const sigBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramStr),
  ].join("&");

  const sigKey = `${encodeURIComponent(X_API_SECRET)}&${encodeURIComponent(X_ACCESS_TOKEN_SECRET)}`;
  const signature = crypto
    .createHmac("sha1", sigKey)
    .update(sigBase)
    .digest("base64");

  oauthParams.oauth_signature = signature;

  const headerValue =
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
      .join(", ");

  return headerValue;
}

// ─────────────────────────────────────────────
// X API v2 ツイート投稿
// ─────────────────────────────────────────────

async function postTweet(text) {
  const { default: fetch } = await import("node-fetch");

  const url = "https://api.twitter.com/2/tweets";
  const method = "POST";
  const body = JSON.stringify({ text });

  const authHeader = buildOAuthHeader(method, url, {});

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `X API エラー: ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

// ─────────────────────────────────────────────
// 投稿履歴に記録
// ─────────────────────────────────────────────

function recordHistory(tweetText, tweetId, pattern) {
  const histPath = path.join(__dirname, "../../data/post_history.json");
  const history = readJson(histPath, []);

  history.push({
    date: today(),
    pattern,
    tweet_id: tweetId,
    text: tweetText,
    posted_at: new Date().toISOString(),
  });

  // 直近90件のみ保持
  const recent = history.slice(-90);
  writeJson(histPath, recent);
  console.log("✅ data/post_history.json 更新完了");
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

async function main() {
  console.log("🐦 x_post 開始:", new Date().toISOString());

  // 認証情報チェック
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    throw new Error("X API の認証情報が不足しています（Secrets を確認）");
  }

  // 二重投稿チェック
  if (checkAlreadyPosted()) {
    process.exit(0);
  }

  const pattern = (SELECTED_PATTERN || "A").toUpperCase();
  const tweetText = loadTweetText();

  console.log("📝 投稿内容:");
  console.log("────────────────────────────");
  console.log(tweetText);
  console.log("────────────────────────────");
  console.log(`文字数: ${[...tweetText].length}`);

  console.log("🚀 X API に投稿中...");
  const result = await postTweet(tweetText);

  const tweetId = result?.data?.id;
  console.log(`✅ 投稿成功！ Tweet ID: ${tweetId}`);
  console.log(`🔗 https://twitter.com/i/web/status/${tweetId}`);

  markAsPosted();
  recordHistory(tweetText, tweetId, pattern);

  console.log("✅ x_post 完了:", new Date().toISOString());
}

main().catch((err) => {
  console.error("❌ x_post エラー:", err);
  process.exit(1);
});
