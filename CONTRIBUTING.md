# コントリビューションガイド

このプロジェクトでは、変更履歴を読みやすく保つためにコミットメッセージの形式を統一します。

## コミットの基本ルール

- 1つのコミットには、1つの目的だけを含める
- 機能追加と無関係な整形やリファクタリングを混ぜない
- コミット前に`git diff --staged`で対象を確認する
- 動作途中の`WIP`コミットは、共有前にまとめるか書き直す
- 生成物、秘密情報、個人用の設定をコミットしない

## コミットメッセージ

1行目は次の形式で記述します。

```text
type: 変更内容の要約
```

`type`には、次のいずれかを使用します。

| type       | 使用する変更                       |
| ---------- | ---------------------------------- |
| `feat`     | 新しい機能や画面を追加する         |
| `fix`      | 不具合を修正する                   |
| `docs`     | READMEや設計資料だけを変更する     |
| `refactor` | 動作を変えずにコードを整理する     |
| `style`    | コードの意味を変えずに書式を直す   |
| `test`     | テストを追加・修正する             |
| `build`    | 依存関係やビルド環境を変更する     |
| `ci`       | CIの設定を変更する                 |
| `chore`    | 上記に当てはまらない保守作業を行う |

要約は日本語で簡潔に書き、末尾に句点を付けません。

良い例:

```text
feat: 未完了課題の一覧画面を追加
fix: 期限なし課題の並び順を修正
docs: WSLセットアップ手順を更新
build: Docker環境のセットアップ処理を追加
chore: Gitの除外設定を整理
```

避ける例:

```text
更新
いろいろ修正
fix
WIP
feat: 課題一覧とREADMEとCSSを修正
```

変更理由や注意点が1行で伝わらない場合は、空行を挟んで本文を追加します。

```text
fix: 完了操作後に課題が残る問題を修正

IndexedDBへの保存完了後に一覧を再計算するよう変更した。
```

## コミットの作り方

変更内容を確認します。

```bash
git status
git diff
```

同じ目的のファイルだけをステージします。

```bash
git add <file>
git diff --staged
```

ルールに沿ったメッセージでコミットします。

```bash
git commit -m "type: 変更内容の要約"
```

複数の目的がある場合は、目的ごとに`git add`と`git commit`を繰り返してください。

## コードフォーマット

このプロジェクトでは、コードフォーマッターとしてPrettierを使用します。
コマンドはリポジトリのルートで実行してください。

初回のみ、または`package-lock.json`が更新された場合は、依存関係をインストールします。

```bash
npm ci
```

ファイルを変更したら、フォーマット違反がないか確認します。
このコマンドはファイルを書き換えません。

```bash
npm run format:check
```

フォーマット違反が見つかった場合は、次のコマンドで自動修正します。

```bash
npm run format
```

`npm run format`は対象となるファイルを自動的に書き換えます。
実行後は、意図しない変更が含まれていないか確認してください。

```bash
git diff
npm run format:check
```

最後に`npm run format:check`が成功することを確認してからコミットしてください。
同じチェックはGitHub Actionsでも実行されます。

## コミット前の確認

- 意図しないファイルがステージされていない
- `.env`などの秘密情報が含まれていない
- `.codex/`や`.agents/`などの個人用設定が含まれていない
- 変更した機能を自分の環境で確認した
- ドキュメントと実装の内容が一致している
- `npm run format:check`が成功する

## プルリクエストとマージ

`main`へ直接変更を入れず、作業ブランチからプルリクエストを作成します。
マージには、次の条件をすべて満たす必要があります。

- 1人以上の承認レビューを得る
- GitHub Actionsの必須チェック`Prettier`が成功する
- レビュー後に新しい変更を加えた場合は、もう一度レビューを受ける
- 未解決のレビューコメントを残さない

リポジトリ管理者は、`main`のブランチルールで次を必須にします。

- `Require a pull request before merging`
- `Required approvals`: `1`
- `Dismiss stale pull request approvals when new commits are pushed`
- `Require status checks to pass before merging`
- 必須ステータスチェック: `Prettier`
- `Require conversation resolution before merging`

PRに対応するIssueがある場合は、PR本文の末尾へ次の形式で記載します。
このPRが`main`へマージされると、指定したIssueが自動的に閉じられます。

```text
Closes #123
```

## ブランチ名のルール

実装内容(ex:feature)/issue番号(ex:2)-実装内容（ex:login-page)
