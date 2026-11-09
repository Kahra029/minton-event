# バドミントンサークル出欠管理アプリ
## 実装ガードレール

## 1. 目的

AI主体で実装を進める際に、実装方針や品質基準がばらつかないようガードレールを定義する。

人間側は以下に責任を持つ。

- 要求定義
- ユースケース定義
- アーキテクチャ
- データモデル
- API設計
- セキュリティ
- 認可
- テスト方針
- 受け入れ条件
- AI生成コードのレビュー

## 2. 最重要原則

### Circle境界を必ず守る

すべてのデータアクセスで、対象データがログイン中のCircleに所属していることを確認する。

```text
NG:
Event IDのみでEventを取得する

OK:
Circle ID + Event IDでEventを取得する
```

Member、Event、Attendance、Invitationも同様。

### 認可をFrontendだけに依存しない

- Frontendで操作を非表示
- BackendでもRoleを検証

APIへ直接アクセスされても不正操作が成立しないこと。

## 3. 認証・ユーザー管理

### Login

```text
/login/{circleLoginID}
```

入力:
- Email
- Password

circleLoginIDからCircleを特定し、Circle ID + EmailでMemberを特定する。

### Email

```text
UNIQUE(Circle ID, Email)
```

同一Emailが複数Circleに所属することは許容する。

### circleLoginID

サービス全体で一意とする。

circleLoginIDを知っていること自体を認証・認可の根拠にはしない。

### Password

- 平文保存しない
- 安全なPassword Hash方式を使う
- 秘密情報をSource / Git / Frontendへ埋め込まない

## 4. Invitation

Invitation Tokenは以下を満たす。

- 推測困難
- 十分なランダム性
- 有効期限あり
- 利用済みTokenは再利用不可
- 無効化済みTokenは利用不可

InvitationのEmailと作成されるMemberのEmailは一致させる。

## 5. データ整合性

Attendance:

```text
UNIQUE(Event ID, Member ID)
```

未回答:

```text
レコードなし = 未回答
attending = 参加
absent = 不参加
```

別CircleのMemberからAttendance登録できない。

## 6. Validation

入力値検証はFrontend / Backend双方で行う。

- Frontend: UX向上
- Backend: データ整合性・Security

Backend側のValidationを省略しない。

## 7. API

エラー種別:
- Validation Error
- Unauthorized
- Forbidden
- Not Found
- Conflict
- Internal Server Error

内部エラーやStack TraceをそのままClientへ返さない。

MVPでは過度な汎用化・抽象化を避ける。

## 8. DB / Migration

DB構造変更はMigrationで管理する。

Git管理対象:
- Migration
- Schema
- 必要な初期データ

本番DBだけを手作業で変更しない。

## 9. Library / Dependency

新しいLibrary導入時は以下を確認する。

- 何を解決するか
- 自前実装より採用するメリット
- Maintenance状況
- Security
- Dependency
- Architectureとの整合

「AIが提案したから」だけで導入しない。

## 10. AI生成コード

以下を人間が確認する。

- 要件を満たすか
- ドメインルールに反していないか
- Circle境界が守られているか
- 認証・認可が適切か
- 異常系を考慮しているか
- 不要な複雑性がないか
- 設計方針に沿っているか
- Testで意図した振る舞いを保証できているか

## 11. Test

### Unit
- ドメインルール
- Validation
- 権限判定

### Integration
- API
- DB Access
- Authentication
- Authorization
- Circle境界

### E2E
- Login
- Event確認
- Attendance登録
- Attendance変更
- adminによるEvent作成
- Member招待

## 12. モバイルファースト

- タップしやすいUI
- 主要操作を画面上部へ配置
- 不要な画面遷移を増やさない
- 入力項目を増やさない
- 横スクロールを前提としない

## 13. 可観測性

最低限ログから以下を追えること。

- API
- Circle
- 操作対象
- Error種別
- 発生時刻

ログへ記録しない:
- Password
- Invitation Token
- Session Token
- その他秘密情報

## 14. コスト

可能な限り無料枠で維持できる構成を優先する。

ただし無料を理由にSecurity・データ整合性・保守性を大きく損なわない。

## 15. 過剰設計を避ける

将来の可能性だけを理由に以下を先行実装しない。

- 共通Account
- 複雑なRole
- 複数Circle切替
- 汎用Notification基盤
- 高度なCQRS
- Event Sourcing

## 16. MVPでは実装しないもの

- 日程調整
- 途中参加
- 早退
- 未定
- チャット
- コメント
- 会費管理
- コート予約
- ペア・対戦表生成
- 高度な通知
- 共通Account
- Circle切替UI
- 高度な権限管理
