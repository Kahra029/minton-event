# バドミントンサークル出欠管理アプリ
## ドメインモデル・用語定義・画面遷移

## 1. ドメインモデル

MVPでは主要なドメインを以下の5つとする。

- Circle
- Member
- Event
- Attendance
- Invitation

```text
Circle
  ├── Member
  ├── Event
  │     └── Attendance
  │           └── Member
  └── Invitation
```

## 2. ドメイン定義

### Circle
バドミントンサークルそのもの。マルチテナントにおけるテナント単位。

主な属性:
- ID
- Circle Login ID
- Name
- Created At
- Updated At

ログインURL:

```text
/login/{circleLoginID}
```

### Member
Circleに所属し、本サービスを利用するユーザー。

主な属性:
- ID
- Circle ID
- Email
- Display Name
- Role
- Password Hash
- Created At
- Updated At

一意制約:

```text
UNIQUE(Circle ID, Email)
```

同一メールアドレスで複数Circleへ所属することは許容する。

Role:
- admin
- member

### Event
開催することが決定しているバドミントンの練習予定。

主な属性:
- ID
- Circle ID
- Title
- Start At
- End At
- Location
- Created By
- Created At
- Updated At

### Attendance
特定のEventに対するMemberの出欠状態。

ユーザーが選択できる状態:
- 参加
- 不参加

システム上:
- 未回答
- 参加
- 不参加

MVPでは未回答をAttendanceレコードが存在しない状態として表現する。

```text
レコードなし = 未回答
attending = 参加
absent = 不参加
```

一意制約:

```text
UNIQUE(Event ID, Member ID)
```

### Invitation
CircleへMemberを招待するための情報。

主な属性:
- ID
- Circle ID
- Email
- Token
- Status
- Expires At
- Created By
- Created At
- Accepted At

Status:
- pending
- accepted
- expired
- 必要に応じて revoked

## 3. ドメインルール

- すべてのMember、Event、Attendance、InvitationはCircleに所属する
- 別Circleのデータは参照・更新できない
- Memberは同一Eventに1つのAttendanceのみ持つ
- Memberは自分自身のAttendanceのみ変更できる
- adminもMVPでは他MemberのAttendanceを代理変更しない
- Eventの作成・編集・削除はadminのみ行える

## 4. 認証

ログインURL:

```text
/login/{circleLoginID}
```

ユーザー入力:
- Email
- Password

circleLoginIDからCircleを特定し、

```text
Circle ID + Email
```

でMemberを特定する。

## 5. メンバー招待

1. adminがメンバー一覧を開く
2. 招待対象のメールアドレスを入力
3. Invitationを作成
4. 招待メールを送信
5. 招待されたユーザーがURLを開く
6. Display Name / Passwordを設定
7. Memberを作成
8. Invitationをacceptedへ更新
9. 対象Circleを利用可能になる

招待URL:

```text
/invitations/{token}
```

## 6. 主要画面

### ログイン画面
- Email
- Password

### イベント一覧
- 開催日
- 時間
- 場所
- 自分の出欠状態
- 参加人数

### イベント詳細
- 日時
- 場所
- 自分の出欠
- 参加人数
- 不参加人数
- 未回答人数
- 各Memberの出欠状態

操作:

```text
[ 参加する ]
[ 不参加 ]
```

### イベント作成
adminのみ。
- 開始日時
- 終了日時
- 場所
- 必要に応じてタイトル

### イベント編集
adminのみ。
- 保存
- 削除

### メンバー一覧
adminのみ。
- Display Name
- Email
- Role
- 登録状態 / 招待状態

### 初回登録
Invitation経由。
- Circle名
- 招待先Email
- Display Name
- Password
- Password確認

## 7. 画面遷移

```text
/login/{circleLoginID}
        ↓
      ログイン
        ↓
   イベント一覧
        ↓
   イベント詳細
```

admin:

```text
イベント一覧
   ├── イベント作成
   └── メンバー一覧
          ↓
       メンバー招待
```

招待:

```text
招待メール
   ↓
/invitations/{token}
   ↓
初回登録
   ↓
イベント一覧
```

## 8. モバイルUI原則

- Event詳細で確認・出欠登録・人数確認・参加者確認を完結
- 参加 / 不参加を主要操作として目立たせる
- 出欠変更は即時反映
- 横スクロールを前提としない

## 9. MVPでは実装しないもの

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
