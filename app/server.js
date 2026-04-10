/**
 * server.js
 * ai-income-note ポータルサーバー
 * Port: 3000（Renderは PORT 環境変数で上書き）
 */

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "views")));

// ─────────────────────────────────────────────
// ヘルスチェック
// ─────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// ポータル
// ─────────────────────────────────────────────

app.get("/portal", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "portal.html"));
});

app.get("/", (req, res) => {
  res.redirect("/portal");
});

// ─────────────────────────────────────────────
// API: 通知一覧取得
// ─────────────────────────────────────────────

app.get("/api/notifications", (req, res) => {
  const notifPath = path.join(__dirname, "../data/notifications.json");
  try {
    const data = JSON.parse(fs.readFileSync(notifPath, "utf-8"));
    res.json(data);
  } catch {
    res.json([]);
  }
});

// ─────────────────────────────────────────────
// API: pending_approval 一覧取得
// ─────────────────────────────────────────────

app.get("/api/pending", (req, res) => {
  const pendingDir = path.join(__dirname, "../pending_approval");
  try {
    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith(".md"));
    const items = files.map((filename) => {
      const filePath = path.join(pendingDir, filename);
      const content = fs.readFileSync(filePath, "utf-8");
      return { filename, content };
    });
    res.json(items);
  } catch {
    res.json([]);
  }
});

// ─────────────────────────────────────────────
// API: パターンテキスト取得
// ─────────────────────────────────────────────

app.get("/api/pattern/:name", (req, res) => {
  const name = req.params.name.toUpperCase();
  if (!["A", "B", "C"].includes(name)) {
    return res.status(400).json({ error: "Invalid pattern" });
  }
  const filePath = path.join(__dirname, `../data/x_pattern_${name}.txt`);
  try {
    const text = fs.readFileSync(filePath, "utf-8").trim();
    res.json({ pattern: name, text });
  } catch {
    res.status(404).json({ error: "Pattern file not found" });
  }
});

// ─────────────────────────────────────────────
// API: 投稿履歴取得
// ─────────────────────────────────────────────

app.get("/api/history", (req, res) => {
  const histPath = path.join(__dirname, "../data/post_history.json");
  try {
    const data = JSON.parse(fs.readFileSync(histPath, "utf-8"));
    res.json(data.slice(-30).reverse()); // 直近30件を新しい順
  } catch {
    res.json([]);
  }
});

// ─────────────────────────────────────────────
// サーバー起動
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 ai-income-note ポータルサーバー起動`);
  console.log(`   http://localhost:${PORT}/portal`);
  console.log(`   環境: ${process.env.NODE_ENV || "development"}`);
});
