# HANDOVER — Gemini Flash2.5 → Pro2.5 切替

目的: LLMをPro2.5へ切替。重複通知防止・無効化・coaching_level分岐は不変。
再現: `./scripts/repro.sh` 実行。TZ=UTC、固定時刻でテスト。
失敗テスト(意図):

- should create only one notification per minute … minute-bucket重複防止
- should change message based on coaching_level … gentle/intenseの分岐
- should not create notification if is_enabled is false … 無効化時は通知0件
  契約(JSON Schema): docs/contracts/reminder.schema.json
  切替: ENV MODEL_VARIANT=flash|pro、ProでinvalidならFlashにフォールバック
  計測: validation error率, 重複通知率
