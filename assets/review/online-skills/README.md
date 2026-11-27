# オンラインスキル確認

実HTTP/SSEサーバーと2つのブラウザセッションで検証。既存の戦闘中スキルパネル・カード使用前の選択UIを操作した。テスト用の一時部屋を使用。

| 状態 | PC 1440×900 | タッチスマホ390×844 |
| --- | --- | --- |
| 相手の公開スキル発動名・効果 | [PC](pc-opponent-log.png) | [スマホ](mobile-opponent-log.png) |
| カード使用前のMP/HP確認 | [PC](pc-cost-confirm.png) | [スマホ](mobile-cost-confirm.png) |
| 再接続後の発動ログ | [PC](pc-reconnected-log.png) | [スマホ](mobile-reconnected-log.png) |

[操作検証JSON](report.json) / [実装・権限・制限](../../../docs/online-skills.md)

両サイズで、キャンセル時は無消費、確定時はMP1・城HP6を消費。MP不足の選択は確定不可。初回接続・再読み込み・即時再戦後のログ、自動延期設定の送信、既存パネルからの任意スキル実行（HP3・1枚ドロー）も成功。実機の性能/回線条件の検証ではない。
