# バドミントンサークル出欠管理アプリ
## MVP受け入れ条件

## 1. 目的

MVPを完成と判断するための受け入れ条件を定義する。

「画面が存在する」「APIが動く」ではなく、主要ユースケースがユーザー視点で成立することを完成条件とする。

## AC-01 Circle単位でログインできる

Given:
- Circleが存在
- circleLoginID設定済み
- 対象CircleにMemberが存在

When:
- `/login/{circleLoginID}` へアクセス
- 正しいEmail / Passwordを入力

Then:
- Login成功
- 対象CircleのEvent一覧へ遷移
- 別Circleの情報は表示されない

## AC-02 同じEmailで複数Circleへ所属できる

```text
Circle A
user@example.com

Circle B
user@example.com
```

それぞれのCircleで正しく別Memberとして認証され、相互のデータは参照できない。

## AC-03 adminがEventを作成できる

入力:
- 開始日時
- 終了日時
- 場所

Then:
- Event作成
- Login中Circleに所属
- Event詳細へ遷移
- 同一Circle Memberから閲覧可能
- 別Circleから閲覧不可

## AC-04 memberはEventを作成できない

- 作成UIを表示しない
- API直接Requestでも作成不可
- Forbidden

## AC-05 Event一覧を確認できる

表示:
- 開催日時
- 場所
- 自分の出欠状態
- 参加人数

## AC-06 Event詳細を確認できる

表示:
- 日時
- 場所
- 自分の出欠状態
- 参加人数
- 不参加人数
- 未回答人数
- 各Memberの出欠状態

## AC-07 参加を登録できる

Attendance未登録状態から「参加」を選択すると、

- Attendance作成
- Status = attending
- 参加人数増加
- 他Memberからも確認可能

## AC-08 不参加を登録できる

- Attendance作成
- Status = absent
- 不参加人数増加
- 他Memberからも確認可能

## AC-09 Attendanceを変更できる

参加→不参加変更時:

- 新規Attendanceは作成しない
- 既存Attendance更新
- 参加人数 -1
- 不参加人数 +1

逆方向も同様。

## AC-10 未回答と不参加を区別できる

Attendance未登録 = 未回答。
absent = 不参加。

## AC-11 他人のAttendanceを変更できない

- UIから変更不可
- API直接Requestでも変更不可
- Forbidden

adminもMVPでは代理変更不可。

## AC-12 別CircleのEventを参照できない

Circle AのMemberがCircle BのEvent IDを指定しても、

- Event取得不可
- Attendance取得不可
- 不要なCircle B情報を開示しない

## AC-13 adminがMemberを招待できる

- Invitation作成
- 招待Email送信
- 対象Circleに紐づく
- 招待状態を確認可能

## AC-14 memberは招待できない

- 招待UIを表示しない
- API直接Requestでも招待不可

## AC-15 招待から初回登録できる

有効なInvitationから、

- Display Name
- Password

を設定すると、

- InvitationのEmailでMember作成
- InvitationのCircleへ所属
- Invitation = accepted
- Circle利用可能

## AC-16 InvitationのEmailは変更できない

初回登録ではInvitationに紐づくEmailを使用し、別Emailへ変更できない。

## AC-17 Invitation Tokenは再利用できない

accepted済みInvitation URLを再利用しても新しいMemberは作成されない。

## AC-18 Eventを編集できる

adminは、

- 開始日時
- 終了日時
- 場所

を変更でき、同一CircleのMemberから更新後情報を確認できる。

## AC-19 Eventを削除できる

- 削除前に確認
- 確定後Event利用不可
- 関連Attendanceを不整合に残さない

論理削除 / 物理削除はDB設計時に決定する。

## AC-20 スマートフォンで主要操作が完結する

スマートフォンで以下が完結する。

- Login
- Event一覧確認
- Event詳細確認
- 参加 / 不参加登録
- Attendance変更

## AC-21 出欠登録に不要な確認操作を要求しない

```text
参加を選択
↓
保存・反映
```

で完了する。

## AC-22 MVPスコープ外機能を実装しない

- 日程調整
- 途中参加
- 早退
- 未定
- コメント
- チャット
- 会費管理
- コート予約
- ペア・対戦表生成
- 高度な通知
- Circle切替
- 共通Account

## MVP完成条件

1. Circle単位でログインできる
2. adminがEventを作成できる
3. MemberがEventを確認できる
4. Memberが参加 / 不参加を登録できる
5. 出欠を変更できる
6. 未回答 / 参加 / 不参加を区別できる
7. 出欠人数とMember一覧を確認できる
8. 他Circleのデータへアクセスできない
9. adminがMemberをEmailで招待できる
10. InvitationからMember登録できる
11. 権限のない操作をBackend側で拒否できる
12. スマートフォンで主要ユースケースが完結する
