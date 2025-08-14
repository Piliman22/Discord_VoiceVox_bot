# Discord読み上げBot

VOICEVOXを使用したDiscord読み上げBotです。テキストチャンネルのメッセージをボイスチャンネルで音声読み上げし、入退室通知も行います。

## 🎯 主な機能

- **メッセージ読み上げ**: 指定したテキストチャンネルのメッセージを音声で読み上げ
- **入退室通知**: ボイスチャンネルへの入退室を音声でお知らせ
- **多様なキャラクター**: VOICEVOXの豊富な音声キャラクターに対応
- **読み上げ設定**: 速度、音の高さ、音量などの詳細調整が可能
- **キューシステム**: 複数のメッセージを順番に処理
- **Docker対応**: 簡単にデプロイできるDocker環境

## 📋 必要環境

- Node.js 18.0.0以上
- Discord Bot Token
- VOICEVOX Engine（ローカルまたはDockerで起動）

## 🚀 セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/Piliman22/Discord_VoiceVox_bot
cd Discord_VoiceVox_bot
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 設定ファイルの作成

```bash
cp config.example.json config.json
```

`config.json`を編集して、以下の情報を設定してください：

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "clientId": "YOUR_DISCORD_APPLICATION_ID",
  "voicevoxUrl": "http://localhost:50021",
  "speakerId": 3
}
```

### 4. Discord Botの作成

1. [Discord Developer Portal](https://discord.com/developers/applications)でアプリケーションを作成
2. Bot TokenとClient IDを取得
3. 必要な権限を設定：
   - `Send Messages`
   - `Use Slash Commands`
   - `Connect`
   - `Speak`
   - `Use Voice Activity`

### 5. VOICEVOXの準備

#### ローカル実行の場合
[VOICEVOX](https://voicevox.hiroshiba.jp/)をダウンロードして起動

#### Dockerの場合
```bash
docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-ubuntu20.04-latest
```

## 🏃‍♂️ 実行方法

### 開発環境

```bash
npm run dev
```

### 本番環境

```bash
npm run build
npm start
```

### Docker Compose（推奨）

```bash
# 環境変数ファイルを作成
cp .env.example .env
# .envファイルを編集

# 起動
docker-compose -f docker-compose.prod.yml up -d
```

## 🎮 コマンド一覧

| コマンド | 説明 | オプション |
|----------|------|------------|
| `/join` | 指定したボイスチャンネルに参加 | `channel`: 参加するVC |
| `/leave` | ボイスチャンネルから退出 | - |
| `/status` | Bot状態と設定を確認 | - |
| `/set-channel` | 読み上げ対象チャンネルを変更 | `channel`: 対象チャンネル（省略時は現在のチャンネル） |
| `/character` | 読み上げキャラクターを変更 | `speaker`: キャラクターID |
| `/characters` | 利用可能なキャラクター一覧を表示 | - |
| `/speed` | 読み上げ速度を調整 | `value`: 速度（0.5～2.0） |
| `/voice-settings` | 音声の詳細設定 | `speed`, `pitch`, `volume` |
| `/queue` | 読み上げキューの状態を確認 | - |
| `/skip` | 読み上げキューをクリア | - |

## 🎭 利用可能キャラクター

- **四国めたん**: ノーマル、あまあま、ツンツン、セクシー
- **ずんだもん**: ノーマル、あまあま、ツンツン、セクシー  
- **春日部つむぎ**: ノーマル
- **波音リツ**: ノーマル
- **玄野武宏**: ノーマル
- **白上虎太郎**: ふつう
- **青山龍星**: ノーマル
- **冥鳴ひまり**: ノーマル
- **九州そら**: ノーマル、あまあま、ツンツン、セクシー
- **もち子さん**: ノーマル
- **剣崎雌雄**: ノーマル

## 📁 プロジェクト構造

```
Discord_VoiceVox_bot/
├── src/
│   ├── config.ts           # 設定ファイル読み込み
│   ├── index.ts            # エントリーポイント
│   └── discord/
│       ├── launch.ts       # Bot起動とイベント処理
│       ├── command.ts      # スラッシュコマンド定義
│       └── fetch.ts        # VOICEVOX API クライアント
├── config.json             # 設定ファイル
├── config.example.json     # 設定ファイルテンプレート
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.prod.yml
├── .env.example
└── README.md
```

## ⚙️ 設定オプション

### 環境変数（Docker使用時）

```bash
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
VOICEVOX_URL=http://voicevox-engine:50021
VOICEVOX_SPEAKER_ID=3
NODE_ENV=production
```

### config.json（ローカル実行時）

```json
{
  "token": "Discord Bot Token",
  "clientId": "Discord Application ID", 
  "voicevoxUrl": "VOICEVOXエンジンのURL",
  "speakerId": "デフォルト話者ID"
}
```

## 🔧 メッセージ処理機能

- **URL変換**: URLを「URL」に自動変換
- **メンション処理**: Discord記法を読みやすい形に変換
- **絵文字対応**: カスタム絵文字を「絵文字」に変換
- **改行処理**: 改行を句読点に変換
- **長文制限**: 200文字を超えるメッセージはスキップ

## 🐛 トラブルシューティング

### VOICEVOXに接続できない
- VOICEVOXエンジンが起動していることを確認
- ファイアウォールの設定を確認
- ポート50021が利用可能か確認

### Botがボイスチャンネルに接続できない
- Bot権限の確認（Connect、Speak）
- ボイスチャンネルの参加人数制限を確認

### 読み上げが遅い・止まる
- `/queue`コマンドでキュー状態を確認
- `/skip`コマンドでキューをクリア
- VOICEVOXエンジンの負荷状況を確認

## 📝 開発

### ビルド

```bash
npm run build
```

### 開発サーバー起動

```bash
npm run dev
```

### TypeScript設定

- Node.js 18+対応
- strict mode有効
- ESModules使用

## 📄 ライセンス

ISC License

---

**注意**: このBotを使用する際は、Discord利用規約および関連法令を遵守してください。