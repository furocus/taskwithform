# 課題管理アプリ

Google Classroomの課題を見やすく整理し、ユーザー自身の端末内に進捗だけを保存する課題管理アプリです。

現在は実装前の設計段階です。MVPではダミーデータを使ったレスポンシブ画面とローカル進捗保存を先に検証し、Google連携・PWA・公開環境は後から追加します。

## MVPの中心価値

- 教科別に課題を見分けられる
- 未完了の課題だけを一覧表示できる
- 完了操作をした課題は通常の一覧から自動的に消える
- 直近7日間の課題集中状況を把握できる
- PCとスマートフォンの両方で操作しやすい
- 進捗はブラウザ内のローカルDBだけに保存する

## MVP技術構成

- Vue 3
- TypeScript
- Vite
- Tailwind CSS
- Dexie / IndexedDB

詳細は以下を参照してください。

- [PRD](docs/PRD.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [予定ファイル構成](docs/FILE_STRUCTURE.md)
- [ロードマップ](docs/ROADMAP.md)
