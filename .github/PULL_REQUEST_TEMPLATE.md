## Thay đổi và người sở hữu

- Workstream: Frontend / Backend / Database / Integration.
- Vấn đề và hành vi sau thay đổi:
- File/schema/endpoint liên quan:

## Contract và dữ liệu

- [ ] Giữ API DTO hoặc cập nhật `docs/team/API_CONTRACT.md` + parity tests cùng PR.
- [ ] Ghi rõ đang là implementation, mock hay kế hoạch; không báo emulator/live API pass từ fixture.
- [ ] Thay đổi Firestore có query/index/Rules tests, transaction invariants và migration/rollback nếu cần.
- [ ] Không thêm source of truth trùng hoặc client write bypass vote/authorization.

## Kiểm thử đã chạy

Lệnh, kết quả, phạm vi và phần chưa kiểm tra:

## Review trước merge

- [ ] Có review của người sở hữu contract bị ảnh hưởng.
- [ ] Không chứa `.env`, private key, service account, token, DB export/PII hoặc generated dependencies.
- [ ] Không đưa APK build/browser test thành bằng chứng kiểm thử thiết bị thật.
- [ ] Cập nhật checklist/known blockers trong handoff nếu có thay đổi.
