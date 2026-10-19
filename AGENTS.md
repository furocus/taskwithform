# Agent Rules

## Docker and Compose

- DockerやDocker Composeの状態を変更するコマンドは、現在のターンでユーザーが明示的に依頼または承認した場合だけ実行する。
- 許可なくコンテナ、イメージ、ネットワーク、ボリュームを作成、起動、停止、再構築、削除しない。
- `docker compose down -v`、`docker system prune`、ボリューム削除など、データを失う可能性がある操作は、対象と影響を確認して個別に承認を得る。
- `docker compose config`、`docker compose ps`、`docker ps`、`docker inspect`などの読み取り専用操作は、調査に必要な範囲で実行してよい。
- `setup-wsl.sh`はDockerイメージ取得と依存関係の再構築を行うため、ユーザーが実行を依頼した場合だけ実行する。

## 作業手順

- 作業前に`AGENTS.local.md`を読む。担当範囲が依頼にも未指定なら編集前に確認し、担当外の編集は明示された依頼範囲を除いて事前に確認する。初期設定は[手順書](docs/agent-onboarding.md)を参照する。
- 対象領域の[ADR](docs/adr/README.md)を読み、矛盾を報告する。草案を合意済みの仕様として扱わない。
- ADRの復元・重要な設計判断の草案化は`.agents/skills/adr-draft-from-code/SKILL.md`、コード・テストの実装は`.agents/skills/luna-code-writer/SKILL.md`を読み、従う。
- 実作業の終了時は`.agents/skills/worklog-summary/SKILL.md`に従い、個人設定の保存先へ要約を残す。必要なskillや保存先が使えない場合は報告する。
- 詳細はskillsへ置き、AGENTSへの重複記載・無関係な変更・全体整形を避ける。新規skillは個人用を既定とし、共有する場合だけ`.gitignore`の許可対象へ追加する。
