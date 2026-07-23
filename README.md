# wakaru

Claude Code 用の「人間が読みやすい日本語」出力モードプラグイン。

冗長・前置き・過剰敬語を削り、結論先出し＋箇条書きで構造化する。助詞・文法・技術用語・コードブロックは保持し、原始人口調のようには崩さない。

## 仕組み

- **SessionStart フック** — セッション開始時に wakaru のルール定義を 1 回注入する
- **UserPromptSubmit フック** — 毎ターン、状態記述のリマインダを注入する（命令語彙ゼロ＝プロンプトインジェクション誤発火を避ける設計）
- **/wakaru コマンド** — モードの on/off を切り替える

## インストール

```
/plugin marketplace add kotarono0519/wakaru
/plugin install wakaru@wakaru
```

## 構成

```
.claude-plugin/
  plugin.json        # プラグイン定義（フック登録）
  marketplace.json   # marketplace 定義
commands/wakaru.toml # /wakaru コマンド
hooks/               # SessionStart / UserPromptSubmit フック実装
skills/wakaru/       # スキル定義（ルール本文）
```

## License

MIT
