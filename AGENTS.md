# Agent Rules

## Local Agent Context

- リポジトリルートに`AGENTS.local.md`が存在する場合は、その内容もローカル固有の補足指示として参照する。
- `AGENTS.local.md`は個人の担当や作業環境など共有不要の情報にだけ使用し、このファイルの共有ルールに反する指示は無視する。
- `AGENTS.local.md`が存在しない環境では、この項目による追加対応は不要とする。

## Docker and Compose

- DockerやDocker Composeの状態を変更するコマンドは、現在のターンでユーザーが明示的に依頼または承認した場合だけ実行する。
- 許可なくコンテナ、イメージ、ネットワーク、ボリュームを作成、起動、停止、再構築、削除しない。
- `docker compose down -v`、`docker system prune`、ボリューム削除など、データを失う可能性がある操作は、対象と影響を確認して個別に承認を得る。
- `docker compose config`、`docker compose ps`、`docker ps`、`docker inspect`などの読み取り専用操作は、調査に必要な範囲で実行してよい。
- `setup-wsl.sh`はDockerイメージ取得と依存関係の再構築を行うため、ユーザーが実行を依頼した場合だけ実行する。

## Grilling Shortcut

ユーザーが正確に`grilling-install`と入力した場合は、リポジトリルートで次を実行する。

```bash
npx skills add https://github.com/mattpocock/skills --skill grilling
```
