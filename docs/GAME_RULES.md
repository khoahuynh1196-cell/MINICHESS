# Đặc tả luật game Alpha
**Trạng thái:** Canonical `production-4x6-0.1.0` — 2026-08-12
**Nguồn:** Kế hoạch Auto-Battler 2D Mobile v0.3  
**Phạm vi:** luật mô phỏng và PvE Alpha. Mọi thay đổi cần tăng
`ruleset_version` và bổ sung test hồi quy.

## 1. Đơn vị và tính xác định

- Tick combat dài 50 ms; một combat có tối đa 700 tick (35 giây).
- Mọi stat có phần lẻ dùng fixed-point với `SCALE = 1_000`. Ví dụ `1.25`
  attack/giây được lưu là `1_250`; 15% được lưu là `150` phần nghìn.
- Thời lượng được lưu bằng tick, không dùng millisecond trong simulation.
- Các phép nhân/chia làm tròn xuống, trừ khi effect định nghĩa khác. Không dùng
  `Math.random()` hoặc số thực cho bất kỳ quyết định combat nào.
- Một combat được xác định bởi `ruleset_version`, `content_version`, snapshot
  đã khóa và `combat_seed`. Mọi danh sách có ảnh hưởng kết quả phải sắp theo ID
  ổn định trước khi xử lý.

## 2. Bàn đấu và đơn vị

- Bàn logic canonical là 4 cột × 6 hàng. Phe địch dùng ô `0..11`; phe người chơi
  dùng ô `12..23`. Cột là `0..3`.
- Grid index là `row * 4 + column`, tăng từ trái sang phải rồi từ trên xuống.
- Mỗi ô chứa tối đa một unit. Unit chỉ di chuyển bốn hướng (không chéo).
- Tướng, quái và summon có `unit_id` duy nhất trong combat. Tướng/summon không
  được cùng một unit ID sau reconnect hoặc replay.
- Sức chứa người chơi theo vòng là 3, 4, 5, 6, 7, 8, 8, 8. Bench có 8 ô và
  không tham gia combat.

## 3. Snapshot và state machine

Mỗi vòng dùng state machine sau:

```text
PREPARE -> VALIDATE -> LOCK_SNAPSHOT -> SPAWN -> COUNTDOWN -> COMBAT
-> RESOLVE -> REWARD -> PERSIST
```

- Lệnh thay đổi đội hình, trang bị hoặc Unique chỉ hợp lệ ở `PREPARE`.
- `VALIDATE` kiểm tra quyền tenant, capacity, sở hữu item, slot, content version
  và toàn bộ invariant trước khi thay đổi state.
- `LOCK_SNAPSHOT` tạo dữ liệu bất biến gồm vị trí, sao, item, Unique holder,
  trait, enemy composition, content version và ruleset version.
- Trait và hình thái Unique bị khóa ở snapshot; thay đổi inventory sau đó không
  ảnh hưởng combat đang chạy.
- `PERSIST` chỉ hoàn thành sau khi run state, event log và mutation economy cần
  thiết được commit trong cùng transaction hoặc qua outbox có idempotency key.

## 4. Seed và RNG

- Server tạo `run_seed` bằng CSPRNG khi tạo run và không trả giá trị đó cho
  client trong Alpha.
- Các stream RNG tách bằng HMAC-SHA-256: `unique:v1`, `shop:<round>:<refresh>`
  và `combat:<round>:<snapshot_hash>`. Mỗi stream có bộ đếm riêng.
- Unique được chọn từ stream `unique:v1` lúc tạo run, được persist ngay, nhưng
  chỉ reveal khi vòng 4 được resolve và người chơi còn sống.
- Combat chỉ dùng stream combat của vòng hiện tại. Replay nội bộ dùng run seed
  và snapshot đã persist để dựng lại event log.

## 5. Thứ tự xử lý mỗi tick

Ở mỗi tick, engine xử lý theo thứ tự sau; trong một pha, unit xử lý theo
`unit_id` tăng dần.

1. Tăng số tick và phát event hết hạn shield, buff, debuff, DoT hoặc summon.
2. Xử lý scheduled effect đến hạn theo `(due_tick, creation_sequence)`.
3. Loại unit đã chết; nếu phe không còn unit sống, kết thúc combat ngay.
4. Với mỗi unit sống: cập nhật target hợp lệ, quyết định di chuyển, rồi cập nhật
   attack meter hoặc cast state.
5. Resolve các attack/cast đã đủ điều kiện theo `(source_unit_id, sequence)`.
6. Áp dụng damage, heal, shield, mana, death và trigger phát sinh ngay theo thứ
   tự event. Một trigger cùng điều kiện chỉ chạy một lần nếu ghi `once_per_combat`.
7. Kiểm tra kết thúc combat và timeout.

Combat event có `tick`, `sequence`, `type`, `source_unit_id`, `target_unit_id`
và payload tối thiểu để client render; event không chứa quyền thay đổi state.

## 6. Targeting, range và movement

- Mục tiêu hợp lệ là unit sống của phe đối thủ, không phải summon đã biến mất.
- Mục tiêu gần nhất là mục tiêu có path length ngắn nhất trên lưới 4 hướng tới
  ô nằm trong `attack_range`. Khi bằng nhau: HP hiện tại thấp hơn, grid index
  nhỏ hơn, rồi `unit_id` nhỏ hơn thắng.
- `attack_range` tính theo Manhattan distance. Unit đang trong range không di
  chuyển.
- Nếu chưa trong range, unit đi một ô trên đường ngắn nhất. Khi có nhiều ô kế
  tiếp hợp lệ, chọn grid index nhỏ nhất.
- Path chỉ được tính lại khi target chết/không hợp lệ, unit bị knockback/dash,
  hoặc ô kế tiếp bị chặn. Nếu không có đường đi, unit đứng yên và target lại ở
  tick kế tiếp.
- Dash và knockback là displacement nguyên tử: kiểm tra ô đích trước; nếu đích
  không hợp lệ thì di chuyển xa nhất có thể theo hướng đã định, hoặc không di
  chuyển.

## 7. Attack, mana và cast

- `attack_speed` là số attack/giây fixed-point. Mỗi tick không bị cast lock,
  attack meter tăng `attack_speed`; attack xảy ra khi meter đạt `20 * SCALE`,
  rồi trừ ngưỡng một lần. Meter không tạo nhiều hơn một attack trong một tick.
- Basic attack yêu cầu target còn trong range tại thời điểm resolve. Nếu target
  chết hoặc ngoài range, attack bị hủy và meter đã tiêu vẫn không hoàn lại.
- Basic attack luôn physical, nhận crit, và cho attacker 10 mana sau khi hit.
- Mỗi event damage nhận mana cho nạn nhân tối đa 5. Mana luôn bị clamp trong
  `[0, max_mana]`.
- Khi mana đạt `max_mana`, unit khóa target hiện tại và bắt đầu cast ở tick kế
  tiếp. Mana được đặt về 0 lúc cast bắt đầu; unit không basic attack trong cast.
- Mỗi skill khai báo `cast_time_ticks` (mặc định 10 tick) và `target_policy`.
  Nếu target bị khóa đã chết, effect single-target fizzle; effect area dùng ô
  mục tiêu cuối cùng đã khóa.
- Chỉ skill có cờ `can_crit` mới crit. Skill không có cờ này không nhận crit
  chance hoặc crit multiplier.

## 8. Damage, heal, shield và stat

- `max_hp`, `attack_damage`, `armor`, `magic_resist`, mana và mọi base value là
  số nguyên không âm sau khi tổng hợp modifier. Resistance nhỏ hơn 0 bị clamp
  về 0 trong Alpha.
- Physical damage dùng Armor; magic damage dùng Magic Resist; true damage bỏ
  qua resistance.
- Với physical/magic damage, dùng:

```text
final_damage = floor(raw_damage * 100 / (100 + effective_resistance))
```

- Crit nhân raw damage với `crit_multiplier`; mặc định là 150%. Crit chance bị
  clamp trong `[0, 100%]`.
- Skill value có `scales_with_skill_power = true` dùng:

```text
final_value = floor(base_value * (SCALE + skill_power) / SCALE)
```

- Heal không vượt `max_hp`. Shield là instance riêng gồm value, expiry tick và
  creation sequence; damage tiêu shield hết hạn sớm hơn trước, rồi sequence.
  Shield dư không chuyển thành HP.
- `buff_stat` và `debuff_stat` chỉ thay đổi stat được khai báo trong content,
  có duration bắt buộc. Modifier cùng ID chỉ refresh duration, không stack,
  trừ khi content nêu rõ `stack_limit`.
- Slow không giảm dưới 10% move speed gốc. Attack speed không giảm dưới 0.1
  attack/giây.

## 9. Effect primitive và summon

Các primitive hợp lệ là `deal_damage`, `heal`, `shield`, `stun`, `slow`,
`buff_stat`, `debuff_stat`, `dash`, `knockback`, `summon`, `apply_dot` và
`cleanse`. Hero/item/trait chỉ được compose từ các primitive này.

- Stun ngăn movement, basic attack và bắt đầu cast; cast đã bắt đầu không bị
  hủy trừ khi effect tương lai định nghĩa interrupt.
- `cleanse` chỉ xóa debuff có cờ `cleanseable`; không xóa stun, trait, item,
  shield hoặc modifier tích cực trong Alpha.
- Mỗi phe có summon cap chung là 3. Summon vượt cap thất bại và ghi event.
- Summon không có trait, không mang item/Unique, không tạo reward, và không
  được tính vào timeout score. Decoy U05 có 25% max HP holder, 0 damage và tự
  biến mất sau 80 tick.

## 10. Kết thúc combat và PvE

- Combat kết thúc thắng khi đối thủ không còn unit sống; kết thúc thua khi phe
  người chơi không còn unit sống.
- Ở tick 700, score mỗi phe là tổng `current_hp / max_hp` của tướng/quái gốc;
  summon không tính. So sánh bằng phép nhân chéo, không dùng float.
- Nếu score bằng nhau ở timeout, defender thắng. Trong PvE, quái là defender;
  do đó người chơi thua khi hòa timeout.
- Khi người chơi thua, mất `min(12, 4 + 2 * số quái còn sống)`. Player bắt đầu
  run với 30 HP; HP không thể thấp hơn 0.
- Reward chỉ được resolve sau combat result cuối cùng và dùng idempotency key
  `run_id:round:reward`. Vòng 4 còn sống reveal đúng một Unique đã preselected.

## 11. Shop, sao, trait và item

- Run bắt đầu với 8 gold; sau mỗi vòng nhận 5 gold cơ bản. Interest và streak
  chưa thuộc canonical Alpha; XP được bật với 4 XP mỗi lần mua và progression
  từ level 3 đến level 9 theo ruleset `production-4x6-0.1.0`.
- Shop có 5 hero; refresh giá 2 gold. Hero cost nằm trong `[1, 3]`.
- Ba bản sao cùng hero và cùng sao ghép thành sao tiếp theo. Chín bản sao tổng
  cộng thành ba sao. Item của các bản sao được trả về run inventory trước khi
  merge; item không tự nhân bản.
- Trait chỉ đếm hero khác nhau trên bàn; bench và summon không đếm. Hóa hình,
  sao và bản sao không thay đổi trait. Trait được khóa tại `LOCK_SNAPSHOT`.
- Mỗi hero tối đa hai item, trong đó tối đa một Unique. Unique chiếm một slot,
  chỉ có đúng một item Unique tồn tại trong một run, không reroll và chỉ chuyển
  trong `PREPARE`.

## 12. Invariant bắt buộc

1. Cùng input/snapshot/seed/version luôn có event sequence và result hash như nhau.
2. Client không thể chọn tenant, seed, damage, combat outcome, reward hoặc currency.
3. Retry/reconnect không tạo thêm reward, ledger entry hoặc Unique.
4. Không state nào có hai Unique trong cùng run hoặc một unit có hai Unique.
5. Không content/item/skill nào được xử lý bằng nhánh hardcode theo hero ID.
6. Replay dựng lại cùng holder Unique, hình thái và trigger count.
