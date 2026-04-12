/**
 * content_agent.cjs
 * X投稿文 A/B/C 3パターン生成エージェント
 * Claude API (claude-sonnet-4-20250514) 使用
 */

const fs = require("fs");
const path = require("path");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NOTE_URL = "note.com/merry_rat4885";
const MAX_LENGTH = 140;

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function truncate(text, limit = MAX_LENGTH) {
  if ([...text].length <= limit) return text;
  return [...text].slice(0, limit).join("") + "…";
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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─────────────────────────────────────────────
// Claude API 呼び出し
// ─────────────────────────────────────────────

async function callClaude(systemPrompt, userPrompt) {
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
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ─────────────────────────────────────────────
// トレンド・バズキャッシュ読み込み
// ─────────────────────────────────────────────

function loadTrendContext() {
  const trendPath = path.join(__dirname, "../../data/trend_cache.json");
  const trend = readJson(trendPath, {});
  if (trend.keywords && trend.keywords.length > 0) {
    return `今日のトレンドキーワード: ${trend.keywords.slice(0, 5).join("、")}`;
  }
  return "AI副業、ChatGPT活用、自動化収益、noteマネタイズ、フリーランスAI";
}

function loadBuzzContext() {
  const buzzPath = path.join(__dirname, "../../data/buzz_cache.json");
  const buzz = readJson(buzzPath, null);
  if (!buzz) return null;

  return {
    overseas: (buzz.viral_overseas || []).slice(0, 3),
    stats:    (buzz.viral_stats    || []).slice(0, 3),
    topics:   (buzz.hot_topics     || []).slice(0, 5),
    date:     buzz.date,
  };
}

// ─────────────────────────────────────────────
// X投稿文 3パターン生成
// ─────────────────────────────────────────────

async function generateXPatterns(trendContext, buzzContext) {
  // バズデータがある場合は海外引用・事実ベースで生成
  const hasBuzz = buzzContext && (buzzContext.overseas.length > 0 || buzzContext.stats.length > 0);

  let buzzSection = "";
  if (hasBuzz) {
    if (buzzContext.overseas.length > 0) {
      const overseasLines = buzzContext.overseas
        .map(o => `・[${o.account_type}] ${o.ja_summary}（推定${(o.likes_estimate || 0).toLocaleString()}いいね）`)
        .join("\n");
      buzzSection += `\n\n【海外バイラルコンテンツ（引用素材）】\n${overseasLines}`;
    }
    if (buzzContext.stats.length > 0) {
      const statsLines = buzzContext.stats
        .map(s => `・${s.fact}（出典ヒント: ${s.source_hint}）`)
        .join("\n");
      buzzSection += `\n\n【引用できる事実・統計データ】\n${statsLines}`;
    }
    if (buzzContext.topics.length > 0) {
      buzzSection += `\n\n【海外ホットトピック】${buzzContext.topics.join("、")}`;
    }
  }

  const systemPrompt = `あなたはAI副業・note収益化の専門家で、SNSバイラルの仕組みを熟知しています。
Xで毎朝投稿する日本語ツイートを3パターン生成してください。

【絶対条件】
- 各パターン140文字以内（日本語）
- 本文テキストのみ出力（説明・ラベル・番号は不要）
- 3パターンを "===A===" "===B===" "===C===" で区切る
- ハッシュタグ: #AI副業 #AIで稼ぐ
- 誇大表現・虚偽は絶対に使わない
- 事実・統計・海外事例を積極的に引用する

【パターン定義】
${hasBuzz
  ? `A（海外引用型）: 海外バイラルコンテンツを全て日本語に翻訳して引用。英語は一切使わない。形式：「海外で○万いいね│"（日本語訳）" → 日本語コメント」
B（事実・統計型）: 「【データ】○○の調査によると…AIで副業する人の○%が〜という事実」（出典も日本語に翻訳）
C（バズ便乗型）: 「いま海外でバズってる話 → ○○。日本でも同じことできる理由→」（全て日本語）`
  : `A（事例型）: 「AI × ○○で月○万円。やったこと→ 箇条書き3つ。」
B（問いかけ型）: 「AIで副業してる人に聞きたい/○○って使ってますか？ 知らないと損な理由→」
C（数字型）: 「【実証】AIツール○個使って月収+○万円になった話。一番効いたのは○○→」`}`;

  const userPrompt = `今日のコンテキスト: ${trendContext}${buzzSection}

上記の海外バイラル情報・事実データを活用して3パターンのツイートを生成してください。各140文字以内厳守。`;

  const raw = await callClaude(systemPrompt, userPrompt);
  return parsePatterns(raw);
}

function parsePatterns(raw) {
  const result = { A: "", B: "", C: "" };
  const blockA = raw.match(/===A===([\s\S]*?)(?====B===|$)/);
  const blockB = raw.match(/===B===([\s\S]*?)(?====C===|$)/);
  const blockC = raw.match(/===C===([\s\S]*?)(?=={3}|$)/);

  if (blockA) result.A = truncate(blockA[1].trim());
  if (blockB) result.B = truncate(blockB[1].trim());
  if (blockC) result.C = truncate(blockC[1].trim());

  return result;
}

// ─────────────────────────────────────────────
// ファイル保存
// ─────────────────────────────────────────────

function savePatternFiles(patterns) {
  const dataDir = path.join(__dirname, "../../data");
  ensureDir(dataDir);

  fs.writeFileSync(path.join(dataDir, "x_pattern_A.txt"), patterns.A, "utf-8");
  fs.writeFileSync(path.join(dataDir, "x_pattern_B.txt"), patterns.B, "utf-8");
  fs.writeFileSync(path.join(dataDir, "x_pattern_C.txt"), patterns.C, "utf-8");

  console.log("✅ data/x_pattern_A/B/C.txt 保存完了");
}

function savePendingApproval(patterns) {
  const dir = path.join(__dirname, "../../pending_approval");
  ensureDir(dir);
  const dateStr = today();
  const filePath = path.join(dir, `x_${dateStr}.md`);

  const content = `# X投稿承認待ち - ${dateStr}

## パターンA（事例型）
${patterns.A}

---

## パターンB（問いかけ型）
${patterns.B}

---

## パターンC（数字型）
${patterns.C}

---
*生成日時: ${new Date().toISOString()}*
`;

  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`✅ pending_approval/x_${dateStr}.md 保存完了`);
  return filePath;
}

// ─────────────────────────────────────────────
// 通知追加
// ─────────────────────────────────────────────

function addNotification(patterns) {
  const notifPath = path.join(__dirname, "../../data/notifications.json");
  const notifications = readJson(notifPath, []);

  notifications.push({
    id: `x_${today()}_${Date.now()}`,
    type: "approval_required",
    title: `X投稿承認待ち - ${today()}`,
    message: "content_agentが新しいX投稿文A/B/Cを生成しました。ポータルで承認してください。",
    patterns: {
      A: patterns.A.slice(0, 30) + "…",
      B: patterns.B.slice(0, 30) + "…",
      C: patterns.C.slice(0, 30) + "…",
    },
    pending_file: `x_${today()}.md`,
    created_at: new Date().toISOString(),
    status: "pending",
  });

  writeJson(notifPath, notifications);
  console.log("✅ data/notifications.json 通知追加完了");
}

// ─────────────────────────────────────────────
// PDCA サイクル更新
// ─────────────────────────────────────────────

function updatePdca(patterns, trendContext) {
  const pdcaPath = path.join(__dirname, "../../data/pdca_content.json");
  const pdca = readJson(pdcaPath, { cycles: [], total_generated: 0 });

  pdca.total_generated = (pdca.total_generated || 0) + 1;
  pdca.last_run = new Date().toISOString();
  pdca.cycles.push({
    date: today(),
    trend_context: trendContext,
    patterns_generated: {
      A: patterns.A.slice(0, 50),
      B: patterns.B.slice(0, 50),
      C: patterns.C.slice(0, 50),
    },
    status: "pending_approval",
  });

  // 直近30件のみ保持
  if (pdca.cycles.length > 30) {
    pdca.cycles = pdca.cycles.slice(-30);
  }

  writeJson(pdcaPath, pdca);
  console.log("✅ data/pdca_content.json PDCA更新完了");
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

async function main() {
  console.log("🤖 content_agent 開始:", new Date().toISOString());

  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません");
  }

  const trendContext = loadTrendContext();
  console.log("📊 トレンドコンテキスト:", trendContext);

  const buzzContext = loadBuzzContext();
  if (buzzContext) {
    console.log("🔥 バズキャッシュ読み込み完了:", buzzContext.date);
    console.log("   海外バイラル:", buzzContext.overseas.length, "件 / 統計データ:", buzzContext.stats.length, "件");
  } else {
    console.log("ℹ️  バズキャッシュなし（通常モードで生成）");
  }

  console.log("✍️  Claude APIでX投稿文 A/B/C を生成中...");
  const patterns = await generateXPatterns(trendContext, buzzContext);

  console.log("\n--- 生成結果 ---");
  console.log("A:", patterns.A);
  console.log("B:", patterns.B);
  console.log("C:", patterns.C);
  console.log("----------------\n");

  savePatternFiles(patterns);
  savePendingApproval(patterns);
  addNotification(patterns);
  updatePdca(patterns, trendContext);

  console.log("✅ content_agent 完了:", new Date().toISOString());
}

main().catch((err) => {
  console.error("❌ content_agent エラー:", err);
  process.exit(1);
});
