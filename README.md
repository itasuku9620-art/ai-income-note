# AI Income Note
**「AI × 〇〇で稼ぐ」note収益化 自動化システム**

X（Twitter）とnoteを組み合わせて、AI副業コンテンツを自動生成・承認・投稿するシステムです。

---

## 🚀 ポータル
https://ai-income-note.onrender.com/portal

---

## 📦 構成

| エージェント | 実行時刻(JST) | 役割 |
|---|---|---|
| trend_agent | 06:00 毎日 | トレンドキーワード収集 |
| research_agent | 07:00 毎日 | 稼ぐ事例リサーチ |
| content_agent | 10:00 毎日 | X投稿文A/B/C生成 |
| note_agent | 11:00 毎日 | note記事下書き生成 |
| analytics_agent | 月曜 09:00 | 週次分析 |
| monetization_agent | 日曜 10:00 | 収益化KPIレポート |
| post-approved-x | 07:00 毎日 / 承認時 | X自動投稿 |

---

## ⚙️ 初期設定

### 1. GitHub Secrets 設定
```
ANTHROPIC_API_KEY   - Anthropic API キー
X_API_KEY           - X Developer App APIキー
X_API_SECRET        - X Developer App シークレット
X_ACCESS_TOKEN      - Xアクセストークン
X_ACCESS_TOKEN_SECRET - Xアクセストークンシークレット
GITHUB_PAT          - ポータル承認用PAT（repo, actions 権限）
```

### 2. Render デプロイ
1. Renderで新規 Web Service を作成
2. `itasuku9620-art/ai-income-note` リポジトリを接続
3. Build Command: `npm install`
4. Start Command: `node app/server.js`

### 3. ポータルでPAT設定
https://ai-income-note.onrender.com/portal の設定ページでGitHub PATを入力

---

## 🔄 承認フロー

```
content_agent（10:00）
    ↓ X投稿文A/B/C生成
    ↓ data/x_pattern_A/B/C.txt
    ↓ pending_approval/x_YYYY-MM-DD.md
    ↓ data/notifications.json に通知
    ↓
ポータルで確認・選択
    ↓ [パターンAで投稿] / [B] / [C] / [却下]
    ↓ GitHub API → repository_dispatch
    ↓
post-approved-x.yml 起動
    ↓ 翌朝7:00 JST に X 自動投稿
```

---

## 📁 重要ファイル

- `data/` - Git管理対象（.gitignoreに入れない）
- `approved/.gitkeep` - 最初から存在
- `data/x_pattern_A/B/C.txt` - 今日の投稿候補
- `data/post_history.json` - 投稿履歴
- `data/pdca_*.json` - PDCAサイクルデータ

---

## 💰 収益化ロードマップ

| フェーズ | 期間 | 目標 |
|---|---|---|
| 蒔く期 | 2026年4〜6月 | システム構築・フォロワー100人 |
| 育てる期 | 2026年7〜9月 | 有料記事・メンバーシップ・月収1〜3万円 |
| 刈り取る期 | 2026年10月〜 | 収益安定・月収5〜10万円 |
