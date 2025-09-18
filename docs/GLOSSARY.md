# GLOSSARY

- **Never‑Zero (safe)**: auto generic はせず、ユーザー承認で追加。skip文言は event=skip。
- **generic\_\***: 汎用食品コード。信頼度低。比率をKPI化。
- **unknown\_\***: 未解決コード。UIで解決→generic/正式コードへ。監査と復元可。
- **set_proposals**: 主菜に対するサイド提案（デフォルトOFF）。決定は accepted/rejected/later。
- **Atwater**: kcal=4P+9F+4C。既定は現行ポリシー（脂質微調整→スケール）。
- **dict_version / schema_version**: 保存時の参照版。過去再現性のためmetaに保存。
- **Idempotency Key**: 同一payloadの二重登録を防止するキー。
- **Dual Write / Dual Read**: 旧新同時保存/新で読んで互換出力。
- **Shadow Table**: 新経路の検証用保存先（90日）。
- **P95 / SLO**: 95%点/運用品質目標。
