# taskwithform

ClassroomとFormから課題情報を取得し、進捗を管理するWebアプリです。

## ローカルでフロントエンドとバックエンドを確認する

正規の開発経路は、WSL2上のDocker EngineとDocker Composeです。Node.js、npm、開発サーバーはComposeのコンテナ内で実行します。

リポジトリに含まれる`./dev`ラッパーを使うと、短いコマンドでCompose内のNode.jsとnpmを実行できます。
リポジトリのルートで次を実行してください。

```bash
./dev up
```

`frontend`と`backend`は、先に`install`サービスがComposeの共通開発イメージ内で`npm ci --include=dev`を完了してから起動します。初回セットアップや`package-lock.json`更新後に依存関係だけを入れ直す場合は、次を実行します。

```bash
./dev install
```

テスト、型チェック、ビルドなどのNode.js/npmコマンドもCompose内で実行します。

```bash
./dev npm test
./dev npm run typecheck
./dev npm run build
./dev node --version
```

ブラウザで`http://localhost:5173/login`を開くとログインページが表示されます。

`http://localhost:3000/api/health`を開くと`{"status":"ok"}`が返ります。
バックエンドの未定義パスはHTTP 404になります。

バックエンドは`http://localhost:3000/api/health`で確認できます。Composeネットワーク内ではフロントエンドのVite proxyが`http://backend:3000`へ接続します。

ログを確認する場合は`./dev logs`を実行します。Composeを終了する場合は`./dev down`を使用してください。

`frontend`と`backend`には`restart: unless-stopped`を設定しているため、`./dev up`で一度起動しておけば、Docker Engineの再起動後も自動的に再起動します。`./dev down`を実行した場合は意図的な停止として扱われるため、再度`./dev up`が必要です。

## Google認証なしでフロントエンドを確認する

画面だけを確認する場合は、バックエンドやGoogle OAuthを準備せずにモックプレビューを起動できます。

```bash
./dev mock
```

ブラウザで`http://localhost:5174/`を開いてください。認証済みセッションとClassroomコース3件をローカルで模擬します。

このコマンドは実Googleアカウント、トークン、Classroomデータを使用しません。通常のフロントエンド開発環境と認証処理には影響せず、モックで未定義のAPIはHTTP 404になります。終了するには`./dev down`を実行します。

## Google OAuthを使って動作確認する

Google Classroomのコースと課題、Gmailの接続状態を取得するには、Google CloudでOAuthクライアントを作成し、ローカル環境変数を設定します。

1. Google CloudプロジェクトでGoogle Classroom APIを有効にする
2. 同じプロジェクトでGmail APIを有効にする
3. OAuth同意画面を設定する
4. 「ウェブ アプリケーション」種類のOAuthクライアントを作成する
5. 承認済みのリダイレクトURIに`http://localhost:3000/api/auth/google/callback`を登録する
6. `.env.example`を`.env`へコピーし、発行されたクライアントIDとクライアントシークレットを設定する

```bash
cp .env.example .env
```

```dotenv
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
FRONTEND_ORIGIN=http://localhost:5173
```

`.env`には秘密情報が含まれるためGitへコミットしないでください。

設定後、`./dev up`を実行し、`http://localhost:5173/login`からログインします。許可を求めるGoogle ClassroomとGmailのスコープは読み取り専用です。権限追加前にログイン済みの場合は、一度ログアウトして再ログインしてください。

認証後は次のバックエンドAPIを利用できます。

- `GET /api/classroom/courses/count`: ACTIVEなコースの合計件数
- `GET /api/classroom/coursework/forms`: PUBLISHEDな課題と添付されたGoogle FormのURL identifier（`formId`）・形式（`formIdType`）
- `GET /api/gmail/connection`: Gmail APIへ接続できる場合は`{"connected":true}`

Gmail接続確認ではメール一覧やメール本文を取得しません。`formId`はForms APIのcanonical resource IDではなく、Google Form URL中のopaque identifierです。

認証情報はバックエンドのメモリ上だけに保持します。アクセストークンの期限切れまたはバックエンドの再起動後は、再ログインが必要です。

OAuth基盤の設計は[Issue 10 Google OAuth実装ノート](docs/obsidian/issue-10-google-oauth.md)、課題・Form ID取得とGmail接続確認の設計は[Issue 18実装ノート](docs/obsidian/issue-18-classroom-gmail-foundation.md)にまとめています。

## 開発環境のセットアップ

WSL2のUbuntuが入っていれば、Node.jsやnpmをホストへ個別にインストールする必要はありません。
このリポジトリに含まれる`setup-wsl.sh`は、WSL2上のDocker Engine、Docker CLI、Docker Composeを導入・検証します。アプリの依存関係インストールと開発サーバー起動は、セットアップ後にComposeで行います。

必要なもの:

- WSL2
- WSL2上のUbuntu
- インターネット接続
- `sudo`を使用できるUbuntuユーザー
- このリポジトリ

### セットアップを実行する

Ubuntuを開き、このリポジトリのルートへ移動して次のコマンドを実行します。
スクリプト自体に`sudo`は付けないでください。

```bash
cd /path/to/taskwithform
./setup-wsl.sh
```

途中でUbuntuユーザーのパスワードを求められます。
入力中の文字や記号は画面に表示されませんが、そのまま入力してEnterを押してください。

競合するDocker関連パッケージが見つかった場合だけ、次の確認が表示されます。

```text
[setup-wsl] Remove the conflicting packages and continue? [y/N]
```

既存のDocker環境を使用していない場合は、`y`を入力して続行します。
既存環境が必要か分からない場合は、`N`を入力して中断し、チームの管理者へ確認してください。

次のメッセージが表示されればセットアップ成功です。

```text
[setup-wsl] Setup completed successfully.
[setup-wsl] Close all Ubuntu terminals and reopen Ubuntu before running docker without sudo.
```

### Ubuntuを開き直す

セットアップが成功したら、Ubuntuのターミナルをすべて閉じてから開き直します。
これは、Dockerを`sudo`なしで使用するための権限を反映するために必要です。

### 環境を確認する

開き直したUbuntuで、もう一度このリポジトリのルートへ移動します。

```bash
cd /path/to/taskwithform
```

Docker CLIのバージョンを確認します。

```bash
docker -v
```

Docker Composeのバージョンを確認します。

```bash
docker compose version
```

Docker Engineが起動していることを確認します。

```bash
docker info
```

Dockerサービスの自動起動設定と現在の状態を確認します。

```bash
systemctl is-enabled docker
systemctl is-active docker
```

それぞれ`enabled`と`active`が表示されれば、Docker Engineは正常です。

Compose設定を読み取り専用で検証します。

```bash
docker compose config
```

エラーなく完了すればDocker EngineとComposeの準備は完了です。Node.jsのバージョン確認やnpmの依存関係インストールは、`./dev node --version`や`./dev install`などCompose内で行います。

## セットアップに失敗した場合

### `systemd is not enabled`と表示される

Ubuntuで`/etc/wsl.conf`を開き、次の設定を追加します。

```ini
[boot]
systemd=true
```

設定後、WindowsのPowerShellでWSLを停止します。

```powershell
wsl --shutdown
```

Ubuntuを開き直し、もう一度セットアップを実行してください。

```bash
cd /path/to/taskwithform
./setup-wsl.sh
```

### Docker Desktopに関するエラーが表示される

Docker Desktopをインストール済みの場合は、Docker Desktopの
`Settings > Resources > WSL Integration`で対象のUbuntuを無効にします。

Docker DesktopとWSL内のDocker Engineを同じUbuntuで併用しないでください。
設定後はUbuntuを開き直し、もう一度`./setup-wsl.sh`を実行します。

### `permission denied`と表示される

セットアップ成功後に表示された場合は、Ubuntuのターミナルをすべて閉じてから開き直してください。

次のコマンドを実行し、結果に`docker`が含まれていることを確認します。

```bash
id -nG
```

### 競合パッケージが表示される

Docker公式パッケージと、Ubuntuなどが提供する別のDockerパッケージが同居しています。
既存のDocker環境を使用していないことを確認してから、削除を承認してください。

このスクリプトは、既存のイメージ、コンテナ、ボリューム、ネットワークが保存される
`/var/lib/docker`を削除しません。

## setup-wsl.shの処理内容

`setup-wsl.sh`は、次の処理を順番に行います。

1. 実行環境がWSL2上のUbuntuであることを確認
2. systemdが有効であることを確認
3. Dockerと競合するパッケージを確認
4. Docker公式GPG鍵を登録
5. Docker公式APTリポジトリを登録
6. Docker EngineとDocker CLIをインストール
7. containerd、Docker Buildx、Docker Composeをインストール
8. Docker Engineを起動し、WSL起動時の自動起動を有効化
9. 実行ユーザーを`docker`グループへ追加
10. Docker EngineとDocker Composeの動作を確認

スクリプトは再実行できます。Node.jsイメージのビルド、npm依存関係のインストール、アプリの起動は行いません。
すでにDocker関連パッケージがインストールされている場合は、既存の環境を再利用します。

ホスト側へNode.jsやnpmを直接インストールすることはありません。アプリを起動するときは、`./dev up`を実行してください。

> [!WARNING]
> `docker`グループのメンバーは、実質的にroot相当の権限を持ちます。
> 信頼できるユーザーだけが使用してください。

## 参考資料

- [Docker EngineをUbuntuへインストール](https://docs.docker.com/engine/install/ubuntu/)
- [Dockerを非rootユーザーで実行する](https://docs.docker.com/engine/install/linux-postinstall/)
