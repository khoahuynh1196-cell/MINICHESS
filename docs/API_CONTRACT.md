# Contract API Alpha

**Trạng thái:** Khóa cho implementation — 2026-08-03  
**Base path:** `/v1`  
**Mã hóa:** HTTPS + JSON UTF-8

## Nguyên tắc

- Mọi endpoint trừ health check yêu cầu `Authorization: Bearer <Supabase JWT>`.
- API suy ra `actor_id` và `tenant_id` từ JWT/session sau membership check. Hai
  giá trị này không được có trong body client gửi.
- Client dùng UUID v4 mới cho mỗi `command_id`; retry phải giữ nguyên ID.
- Mọi số combat/economy truyền dưới dạng integer fixed-point đã định nghĩa trong
  `GAME_RULES.md`. Không truyền decimal string hoặc float.
- `content_version`, `ruleset_version`, `run_revision` luôn xuất hiện trong
  response liên quan tới run. Client phải refresh khi version không hỗ trợ.
- API không trả `run_seed`, `combat_seed`, nội dung Unique chưa reveal, secret,
  thông tin tenant khác hay raw database error.

## Envelope response

Response thành công:

```json
{
  "data": {},
  "request_id": "uuid",
  "server_time": "2026-08-03T00:00:00.000Z"
}
```

Response lỗi:

```json
{
  "error": {
    "code": "RUN_REVISION_CONFLICT",
    "message": "Run state changed. Refresh and retry.",
    "retryable": true
  },
  "request_id": "uuid"
}
```

Error code ổn định, không localize tại server. Client map `code` sang chuỗi UI.

## Read endpoints

| Method | Path | Mục đích |
| --- | --- | --- |
| `GET` | `/health` | liveness không auth |
| `GET` | `/me/bootstrap` | tenant hiện tại, currency read model, content manifest |
| `GET` | `/runs/:runId` | authoritative run view để resume |
| `GET` | `/runs/:runId/events?after_sequence=N` | combat event/replay event theo sequence |
| `GET` | `/content/:contentVersion/manifest` | manifest content/art tương thích |

`GET /runs/:runId` chỉ trả run thuộc tenant của session; run khác tenant trả
`RUN_NOT_FOUND`, không tiết lộ sự tồn tại.

## Mutation endpoint

Tất cả command run dùng một endpoint để application layer có một transaction
boundary, audit convention và idempotency behavior thống nhất.

```text
POST /v1/runs/:runId/commands
```

Request chung:

```json
{
  "command_id": "7fdaabfe-4fbe-426b-a143-72400508f7b9",
  "expected_run_revision": 12,
  "type": "MOVE_HERO",
  "payload": {}
}
```

Response thành công:

```json
{
  "data": {
    "command_id": "7fdaabfe-4fbe-426b-a143-72400508f7b9",
    "run_id": "uuid",
    "run_revision": 13,
    "status": "APPLIED",
    "run_view": {}
  },
  "request_id": "uuid",
  "server_time": "2026-08-03T00:00:00.000Z"
}
```

Nếu `command_id` đã xử lý, server trả đúng response đã persist lần đầu, với HTTP
200. Nếu `expected_run_revision` cũ và command chưa từng xử lý, trả HTTP 409
`RUN_REVISION_CONFLICT`. Không tự merge mutation.

## Command types Alpha

| Type | Payload bắt buộc | Điều kiện |
| --- | --- | --- |
| `BUY_SHOP_HERO` | `shop_slot_index` | PREPARE, đủ gold/bench slot |
| `REFRESH_SHOP` | không có | PREPARE, đủ 2 gold hoặc free refresh |
| `SELL_HERO` | `hero_instance_id` | PREPARE, hero thuộc run |
| `MOVE_HERO` | `hero_instance_id`, `destination` | PREPARE, board/bench hợp lệ |
| `EQUIP_ITEM` | `item_instance_id`, `hero_instance_id` | PREPARE, slot/item hợp lệ |
| `UNEQUIP_ITEM` | `item_instance_id` | PREPARE, item đang được gắn |
| `START_ROUND` | không có | PREPARE, đội hình hợp lệ |
| `CLAIM_ROUND_REWARD` | `reward_selections: [{offer_id, option_id}]` | REWARD, chọn đúng một option cho mỗi offer |
| `CLAIM_REWARD_HERO` | `hero_instance_id` | PREPARE, reward stash có hero và bench còn chỗ |
| `ACK_UNIQUE_REVEAL` | `reveal_id` | Unique đã reveal; chỉ xác nhận UI |
| `ABANDON_RUN` | không có | run chưa hoàn tất |

`EQUIP_ITEM` dùng cùng command cho Unique; server kiểm tra sở hữu duy nhất,
holder tối đa hai item, tối đa một Unique và round state. `ACK_UNIQUE_REVEAL`
không cấp item, không thay đổi reward hoặc economy.

## Create và resume run

```text
POST /v1/runs
```

Body chỉ gồm version client/content mà client hỗ trợ; server chọn một content
version còn hỗ trợ, tạo run, run seed, shop state, enemy plan và Unique hidden.
Server từ chối tạo run mới khi tenant còn một run active, trừ khi policy sau này
cho phép nhiều run.

```text
POST /v1/runs/:runId/resume
```

Endpoint này không mutate game state. Nó trả snapshot run, revision, event
sequence mới nhất và asset/content manifest cần để trình diễn chính xác.

## Combat event contract

Event immutable và có thứ tự tăng dần trong một round:

```json
{
  "round": 4,
  "sequence": 81,
  "tick": 140,
  "type": "DAMAGE_APPLIED",
  "source_unit_id": "player:H03:1",
  "target_unit_id": "enemy:E04:2",
  "payload": {
    "amount": 23000,
    "damage_type": "physical",
    "is_critical": false,
    "remaining_hp": 41000
  }
}
```

Event payload là whitelist theo `type`; client bỏ qua field chưa biết để cho
phép mở rộng. Client không có API gửi event hoặc combat result.

## HTTP status và error code chính

| Status | Code | Ý nghĩa |
| --- | --- | --- |
| 400 | `INVALID_COMMAND` | body/type/payload không hợp lệ |
| 401 | `UNAUTHENTICATED` | JWT thiếu, hết hạn hoặc không hợp lệ |
| 403 | `TENANT_ACCESS_DENIED` | không có membership/quyền cần thiết |
| 404 | `RUN_NOT_FOUND` | run không thấy trong tenant hiện tại |
| 409 | `RUN_REVISION_CONFLICT` | optimistic concurrency thất bại |
| 409 | `COMMAND_NOT_ALLOWED` | command không hợp lệ với state hiện tại |
| 409 | `IDEMPOTENCY_KEY_REUSED` | ID trùng nhưng payload khác |
| 422 | `GAME_RULE_VIOLATION` | slot, gold, ownership, capacity hoặc content rule sai |
| 429 | `RATE_LIMITED` | vượt giới hạn request/command |
| 503 | `RETRY_LATER` | lỗi tạm thời trước khi command commit |

## Reconnect behavior

1. Client gọi `resume`, áp dụng authoritative `run_view` trước.
2. Client lấy events có `sequence` lớn hơn sequence local đã xác nhận.
3. Command chưa có response được gửi lại với đúng `command_id` và revision gốc.
4. Nếu nhận `RUN_REVISION_CONFLICT`, client bỏ optimistic UI, resume rồi để
   người chơi gửi command mới; không tự động replay input cũ.

## Giới hạn Alpha

- Không WebSocket, command batch, client-side combat result, tenant selector,
  payment endpoint, PvP endpoint hoặc admin endpoint public.
- Rate limit mặc định: 20 read request/phút và 30 run command/phút mỗi actor;
  giới hạn chính xác được cấu hình ở infrastructure, không hardcode controller.
