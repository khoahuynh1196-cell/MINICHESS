# Contract Content Alpha

## Full PvE demo content additions

The full PvE demo has 24 heroes: exactly 21 shop heroes and three reward-only
Unique heroes. `ContentManifest.shopHeroCount` counts records where
`is_unique_hero` is `false`; `ContentManifest.uniqueHeroCount` counts the
remaining Unique records.

A shop hero uses this canonical shape. `rarity` is an integer from 1 through
5, `tags` is an array of non-empty identifiers, and only a non-Unique hero may
have a positive shop `cost`.

```json
{
  "id": "H01",
  "display_key": "hero.h01.name",
  "species_trait_id": "R_VERDANT",
  "class_trait_id": "C_VANGUARD",
  "cost": 1,
  "rarity": 1,
  "tags": ["verdant", "vanguard", "frontline"],
  "is_unique_hero": false,
  "skill_id": "S_H01",
  "visual_profile_id": "VP_H01"
}
```

A reward-only Unique hero has `is_unique_hero: true` and `cost: 0`; it is
never placed in the shared shop pool.

```json
{
  "id": "H22",
  "cost": 0,
  "rarity": 5,
  "tags": ["aether", "arcanist", "unique"],
  "is_unique_hero": true
}
```

Every visual profile must reference its sprite, portrait, ability icon, and
cast VFX keys:

```json
{
  "id": "VP_H01",
  "sprite_key": "heroes/h01/base",
  "portrait_key": "heroes/h01/portrait",
  "ability_icon_key": "heroes/h01/ability_icon",
  "vfx_key": "vfx/heroes/h01/cast",
  "anchors": ["head", "chest", "back", "feet", "weapon"],
  "animations": ["idle", "move", "basic_attack", "hit", "skill_cast", "death"]
}
```

Each encounter declares a non-empty `kind` and one legal biome:
`meadow`, `ruins`, `frost_keep`, or `ember_citadel`.

```json
{
  "id": "PVE_04",
  "round": 4,
  "kind": "miniboss",
  "biome": "frost_keep",
  "rewards": [{ "kind": "unique_reveal", "source": "run_preselected_unique" }]
}
```

**Trạng thái:** Khóa cho implementation — 2026-08-03

## Bundle versioned

Mỗi bundle content là immutable và có manifest:

```json
{
  "content_version": "alpha-0.3.0",
  "ruleset_version": "alpha-0.3.0",
  "asset_manifest_version": "alpha-0.3.0",
  "published_at": "2026-08-03T00:00:00.000Z",
  "sha256": "hex-digest"
}
```

Một run persist đúng `content_version` đã chọn khi tạo. Content compiler đọc toàn
bộ bundle, validate, sắp theo ID và tạo digest trước khi publish.

## Quy ước chung

- Public ID là string in hoa: hero `H01`–`H20`, Unique `U01`–`U06`, item thường
  `I01`–`I12`, trait `R_*` hoặc `C_*`, effect `E_*`.
- Không đổi, tái dùng hoặc suy luận public ID từ tên hiển thị. Localization là
  field riêng.
- Số phần lẻ dùng `SCALE = 1_000`; duration dùng `duration_ticks`; distance dùng
  số cell nguyên. Không content field nào nhận float.
- Content chỉ khai báo data và effect primitive. Không có script, eval, callback
  code hoặc query database trong JSON/YAML content.
- Mọi reference phải tồn tại trong bundle và không tạo circular trigger vô hạn.

## Hero definition

```json
{
  "id": "H01",
  "display_key": "hero.h01.name",
  "species_trait_id": "R_CAT",
  "class_trait_id": "C_GUARDIAN",
  "cost": 1,
  "base_stats": {
    "max_hp": 90000,
    "attack_damage": 5000,
    "attack_speed": 1000,
    "armor": 20000,
    "magic_resist": 20000,
    "attack_range": 1,
    "move_speed": 1000,
    "starting_mana": 0,
    "max_mana": 100000,
    "crit_chance": 0,
    "crit_multiplier": 1500,
    "skill_power": 0
  },
  "star_multipliers": {
    "two": { "max_hp": 1600, "attack_damage": 1500 },
    "three": { "max_hp": 2500, "attack_damage": 2300 }
  },
  "skill_id": "S_H01_COTTON_SHIELD",
  "visual_profile_id": "VP_H01"
}
```

`base_stats` phải có đủ 12 stat. `max_hp`, `max_mana`, `attack_range` và
`move_speed` phải dương; `cost` thuộc `[1,3]`. Star multiplier không áp dụng
cho stat không được liệt kê; compiler tạo stat cuối cùng bằng integer math.

## Skill và effect chain

```json
{
  "id": "S_H01_COTTON_SHIELD",
  "target_policy": "self",
  "cast_time_ticks": 10,
  "effects": [
    {
      "id": "E_H01_SHIELD",
      "primitive": "shield",
      "target": "self",
      "base_value": 22000,
      "scales_with_skill_power": true,
      "duration_ticks": 80
    },
    {
      "id": "E_H01_ARMOR",
      "primitive": "buff_stat",
      "target": "self",
      "stat": "armor",
      "mode": "flat",
      "value": 15000,
      "duration_ticks": 80,
      "stack_limit": 1
    }
  ]
}
```

`primitive` chỉ nhận 11 giá trị trong `GAME_RULES.md`. Mỗi primitive có schema
riêng và reject field thừa. Trigger hợp lệ là `on_combat_start`,
`on_basic_attack`, `on_hit`, `on_cast_start`, `on_cast_resolve`, `on_hp_below`,
`on_kill`, `on_death` và `on_interval`; trigger ngưỡng HP bắt buộc có
`once_per_combat: true` trong Alpha.

## Trait definition

```json
{
  "id": "R_CAT",
  "kind": "species",
  "breakpoints": [{
    "count": 2,
    "effects": [{
      "id": "E_R_CAT_2_CRIT",
      "primitive": "buff_stat",
      "target": "all_trait_holders",
      "stat": "crit_chance",
      "mode": "flat",
      "value": 100
    }]
  }]
}
```

Trait compiler xác minh breakpoint tăng dần, không trùng, không vượt số hero có
thể thuộc trait và target chỉ là unit trong snapshot. `all_trait_holders` không
bao giờ gồm bench, summon hoặc duplicate hero ID.

## Item và Unique definition

```json
{
  "id": "U01",
  "kind": "unique",
  "display_key": "item.u01.name",
  "slot_cost": 1,
  "stat_modifiers": [{ "stat": "max_hp", "mode": "percent", "value": 150 }],
  "triggers": [{
    "id": "E_U01_ROAR",
    "trigger": "on_hp_below",
    "threshold_percent": 500,
    "once_per_combat": true,
    "effects": [{ "primitive": "stun", "target": "adjacent_enemies", "duration_ticks": 20 }]
  }],
  "visual_transformation_id": "VT_LION_CROWN",
  "suggested_holder_tags": ["guardian", "fighter", "frontline"]
}
```

Item thường có `kind: normal` và không có `visual_transformation_id`. Compiler
buộc Unique có đúng một transformation, ít nhất ba hero phù hợp trong bundle và
không phụ thuộc bắt buộc vào đúng một trait/class.

## Encounter và reward

```json
{
  "id": "PVE_R4_BOSS",
  "round": 4,
  "kind": "boss",
  "enemy_roster": [{ "enemy_id": "E_BOSS_01", "star": 1, "position": 1 }],
  "rewards": [
    { "kind": "gold", "amount": 5000 },
    { "kind": "hero_choice", "options": 3 },
    { "kind": "unique_reveal", "source": "run_preselected_unique" }
  ]
}
```

Vòng 1–8 phải có một encounter duy nhất. Vòng 4 bắt buộc có một và chỉ một
`unique_reveal`; không encounter nào khác được có reward này trong Alpha.

### Reward resolution

- The server derives every round reward from the persisted `run_seed`, encounter
  round, reward index, and immutable content. It uses the HMAC stream
  `reward:v1:<round>:<index>:<kind>`; clients never send reward candidates.
- `gold.amount` is fixed-point currency. The Alpha run balance receives
  `floor(amount / 1000)` supplemental gold in addition to the mandatory `+5`
  round gold in `GAME_RULES.md`.
- `shop_refresh` grants one free refresh; `free_reroll.amount` grants that many.
  A free refresh is consumed before a paid 2-gold refresh.
- `normal_item_choice` and `hero_choice` require a positive `options` count.
  A reward claim supplies exactly one selected option for each pending offer.
- `upgrade_choice` grants one deterministic hero copy from its three options.
  Hero copies wait in the run reward stash until the player claims them into a
  bench slot; ordinary star-merge rules then apply.
- `final_chest` is a deterministic three-option normal-item offer in Alpha.

## Visual profile và transformation

```json
{
  "id": "VP_H01",
  "sprite_key": "heroes/h01/base",
  "portrait_key": "heroes/h01/portrait",
  "anchors": ["head", "chest", "back", "feet", "weapon"],
  "animations": ["idle", "move", "basic_attack", "hit", "skill_cast", "death"]
}
```

```json
{
  "id": "VT_LION_CROWN",
  "accessory_key": "transformations/lion_crown/accessory",
  "accessory_anchor": "head",
  "aura_key": "transformations/lion_crown/aura",
  "vfx_key": "transformations/lion_crown/vfx",
  "icon_key": "items/u01/icon",
  "portrait_badge_key": "items/u01/badge",
  "tint": null
}
```

Mỗi hero profile bắt buộc đủ 5 anchor và 6 animation. Compiler fail nếu
transformation tham chiếu anchor không có; runtime không fallback anchor khác.

## Validation bắt buộc trước publish

1. Đủ đúng 20 hero, 5 species trait, 5 class trait, 12 item thường và 6 Unique.
2. Hero distribution và mỗi class có đúng 4 hero theo kế hoạch v0.3.
3. Mọi effect primitive, target, trigger, stat, duration và reference hợp lệ.
4. Không hero/item/trait ID trùng; public ID đã xóa không được tái sử dụng.
5. Mọi hero có visual profile, mọi profile đủ anchor/animation và mọi Unique có transformation.
6. Vòng PvE liên tiếp 1–8; Unique reveal đúng giới hạn.
7. Bundle canonical hash ổn định bất kể thứ tự file trên filesystem.
