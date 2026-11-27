//! ランク：内部レーティング（MMR）・ランクポイント（RP）・表示ランク・認定戦・シーズン。
//! 式は現行サーバーの `server/accounts/ranking.js` と同じ。数値はすべて `data/ranks.json`・`data/seasons.json`（仮）。
//! 保存や通信はしない純粋な計算だけ（サーバーとテストが使う）。

use crate::json::{obj, JsonValue};

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

/// JS の `Math.round`（.5 は +∞ 側へ）と同じ丸め。Rust の `f64::round` は負の .5 で結果が違うので使わない。
pub fn js_round(x: f64) -> i32 {
    (x + 0.5).floor() as i32
}

fn clamp(v: i32, lo: i32, hi: i32) -> i32 {
    v.max(lo).min(hi)
}

#[derive(Debug, Clone, PartialEq)]
pub struct Tier {
    pub id: String,
    pub name: String,
    pub start: i32,
    pub divisions: u32,
    pub division_rp: i32,
    pub top_n: Option<u32>,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MatchmakingConfig {
    pub base_range: i32,
    pub expand_per_step: i32,
    pub step_ms: i64,
    pub max_range: i32,
    pub timeout_ms: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RankConfig {
    pub initial_mmr: i32,
    pub placement_matches: u32,
    pub elo_k: f64,
    pub elo_placement_k: f64,
    pub elo_scale: f64,
    pub rp_win: f64,
    pub rp_loss: f64,
    pub rp_min_gain: i32,
    pub rp_max_gain: i32,
    pub rp_min_loss: i32,
    pub rp_max_loss: i32,
    pub rp_from_mmr_base: f64,
    pub rp_from_mmr_per: f64,
    pub rp_from_mmr_max: i32,
    pub tiers: Vec<Tier>,
    pub matchmaking: MatchmakingConfig,
    pub pair_window_ms: i64,
    pub pair_full_gains: u32,
    pub pair_half_until: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SeasonConfig {
    pub epoch_ms: i64,
    pub length_days: i64,
    pub soft_reset_mmr_keep: f64,
    pub soft_reset_placement: u32,
}

fn num(v: Option<&JsonValue>, d: f64) -> f64 {
    v.and_then(|x| x.as_f64()).unwrap_or(d)
}

impl RankConfig {
    pub fn from_json(v: &JsonValue) -> Result<RankConfig, String> {
        let elo = v.get("elo");
        let rp = v.get("rp");
        let rfm = v.get("rpFromMmr");
        let mm = v.get("matchmaking");
        let pl = v.get("pairLimit");
        let g = |o: Option<&JsonValue>, k: &str, d: f64| num(o.and_then(|x| x.get(k)), d);
        let mut tiers = Vec::new();
        for t in v.get("tiers").and_then(|x| x.as_array()).ok_or("ranks.json: tiers がありません")? {
            let id = t.get("id").and_then(|x| x.as_str()).ok_or("ranks.json: tier の id がありません")?.to_string();
            tiers.push(Tier {
                name: t.get("name").and_then(|x| x.as_str()).unwrap_or(&id).to_string(),
                start: num(t.get("start"), 0.0) as i32,
                divisions: num(t.get("divisions"), 0.0) as u32,
                division_rp: num(t.get("divisionRp"), 100.0) as i32,
                top_n: t.get("topN").and_then(|x| x.as_u32()),
                color: t.get("color").and_then(|x| x.as_str()).unwrap_or("#888888").to_string(),
                id,
            });
        }
        if !tiers.iter().any(|t| t.divisions > 0) {
            return Err("ranks.json: 段（divisions が1以上）のある階級が1つもありません".into());
        }
        if tiers.iter().any(|t| t.divisions > 0 && t.division_rp <= 0) {
            return Err("ranks.json: divisionRp は1以上にしてください".into());
        }
        Ok(RankConfig {
            initial_mmr: num(v.get("initialMmr"), 1000.0) as i32,
            placement_matches: num(v.get("placementMatches"), 5.0) as u32,
            elo_k: g(elo, "k", 32.0),
            elo_placement_k: g(elo, "placementK", 64.0),
            elo_scale: g(elo, "scale", 400.0),
            rp_win: g(rp, "win", 22.0),
            rp_loss: g(rp, "loss", 18.0),
            rp_min_gain: g(rp, "minGain", 10.0) as i32,
            rp_max_gain: g(rp, "maxGain", 40.0) as i32,
            rp_min_loss: g(rp, "minLoss", 8.0) as i32,
            rp_max_loss: g(rp, "maxLoss", 30.0) as i32,
            rp_from_mmr_base: g(rfm, "base", 800.0),
            rp_from_mmr_per: g(rfm, "perMmr", 2.0),
            rp_from_mmr_max: g(rfm, "max", 900.0) as i32,
            tiers,
            matchmaking: MatchmakingConfig {
                base_range: g(mm, "baseRange", 100.0) as i32,
                expand_per_step: g(mm, "expandPerStep", 50.0) as i32,
                step_ms: g(mm, "stepMs", 10000.0) as i64,
                max_range: g(mm, "maxRange", 800.0) as i32,
                timeout_ms: g(mm, "timeoutMs", 90000.0) as i64,
            },
            pair_window_ms: g(pl, "windowMs", 86_400_000.0) as i64,
            pair_full_gains: g(pl, "fullGains", 3.0) as u32,
            pair_half_until: g(pl, "halfUntil", 6.0) as u32,
        })
    }
}

/// "2026-11-01T00:00:00Z" の形（UTC）だけを読む。
pub fn parse_utc_ms(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let n = |a: usize, z: usize| s.get(a..z)?.parse::<i64>().ok();
    let (y, m, d) = (n(0, 4)?, n(5, 7)?, n(8, 10)?);
    let (hh, mm, ss) = (n(11, 13)?, n(14, 16)?, n(17, 19)?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    // days_from_civil（Howard Hinnant）
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = if y2 >= 0 { y2 } else { y2 - 399 } / 400;
    let yoe = y2 - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * DAY_MS + (hh * 3600 + mm * 60 + ss) * 1000)
}

impl SeasonConfig {
    pub fn from_json(v: &JsonValue) -> Result<SeasonConfig, String> {
        let epoch = v.get("epoch").and_then(|x| x.as_str()).ok_or("seasons.json: epoch がありません")?;
        let epoch_ms = parse_utc_ms(epoch).ok_or("seasons.json: epoch は 2026-11-01T00:00:00Z の形で書いてください")?;
        let length_days = num(v.get("lengthDays"), 56.0) as i64;
        if length_days <= 0 {
            return Err("seasons.json: lengthDays は1以上にしてください".into());
        }
        let sr = v.get("softReset");
        Ok(SeasonConfig {
            epoch_ms,
            length_days,
            soft_reset_mmr_keep: num(sr.and_then(|x| x.get("mmrKeep")), 0.5),
            soft_reset_placement: num(sr.and_then(|x| x.get("placementMatches")), 2.0) as u32,
        })
    }

    /// 時刻 t（ミリ秒）のシーズン番号（1から）と、始まり・終わりの時刻
    pub fn season_at(&self, t_ms: i64) -> (u32, i64, i64) {
        let len = self.length_days * DAY_MS;
        let id = ((t_ms - self.epoch_ms).div_euclid(len) + 1).max(1);
        (id as u32, self.epoch_ms + (id - 1) * len, self.epoch_ms + id * len)
    }
}

/// あるシーズンの、ある人の成績
#[derive(Debug, Clone, PartialEq)]
pub struct RankEntry {
    pub season: u32,
    pub mmr: i32,
    pub rp: i32,
    pub peak_rp: i32,
    pub matches: u32,
    pub wins: u32,
    pub placement_left: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DisplayRank {
    pub tier_id: String,
    pub name: String,
    pub division: Option<u32>,
    pub division_label: String,
    pub rp: i32,
    pub rp_into_division: Option<i32>,
    pub rp_for_next: Option<i32>,
    pub color: String,
    pub tier_index: usize,
    pub position: Option<u32>,
}

impl DisplayRank {
    /// 昇格・降格の判定に使う順位の値（大きいほど上）
    pub fn score(&self) -> i64 {
        self.tier_index as i64 * 10 + self.division.map(|d| 4 - d as i64).unwrap_or(0)
    }

    pub fn to_json(&self) -> JsonValue {
        let oi = |v: Option<i32>| v.map(|x| JsonValue::Number(x as f64)).unwrap_or(JsonValue::Null);
        obj(vec![
            ("tierId", JsonValue::String(self.tier_id.clone())),
            ("name", JsonValue::String(self.name.clone())),
            ("division", self.division.map(|x| JsonValue::Number(x as f64)).unwrap_or(JsonValue::Null)),
            ("divisionLabel", JsonValue::String(self.division_label.clone())),
            ("rp", JsonValue::Number(self.rp as f64)),
            ("rpIntoDivision", oi(self.rp_into_division)),
            ("rpForNext", oi(self.rp_for_next)),
            ("color", JsonValue::String(self.color.clone())),
            ("tierIndex", JsonValue::Number(self.tier_index as f64)),
            ("position", self.position.map(|x| JsonValue::Number(x as f64)).unwrap_or(JsonValue::Null)),
        ])
    }
}

/// 1試合ぶんの変化
#[derive(Debug, Clone, PartialEq)]
pub struct RankChange {
    pub entry: RankEntry,
    pub mmr_before: i32,
    pub rp_before: i32,
    pub placement: bool,
    pub scale: f64,
}

impl RankConfig {
    pub fn rp_from_mmr(&self, mmr: i32) -> i32 {
        clamp(js_round((mmr as f64 - self.rp_from_mmr_base) * self.rp_from_mmr_per), 0, self.rp_from_mmr_max)
    }

    /// 新しいシーズンの成績。前のシーズンの成績があれば、MMR を初期値に近づけて引き継ぐ（ソフトリセット）
    pub fn new_entry(&self, seasons: &SeasonConfig, season: u32, prev: Option<&RankEntry>) -> RankEntry {
        let (mmr, rp, placement) = match prev {
            Some(p) => {
                let mmr = js_round(self.initial_mmr as f64 + (p.mmr - self.initial_mmr) as f64 * seasons.soft_reset_mmr_keep);
                (mmr, self.rp_from_mmr(mmr), seasons.soft_reset_placement)
            }
            None => (self.initial_mmr, 0, self.placement_matches),
        };
        RankEntry { season, mmr, rp, peak_rp: rp, matches: 0, wins: 0, placement_left: placement }
    }

    /// RP と（上位階級なら）順位から、表示するランク
    pub fn display_rank(&self, rp: i32, position: Option<u32>) -> DisplayRank {
        let tiers = &self.tiers;
        let mut idx = 0;
        for (i, t) in tiers.iter().enumerate() {
            if t.divisions > 0 && rp >= t.start {
                idx = i;
            }
        }
        if let (Some(top), Some(pos)) = (tiers.iter().find(|t| t.divisions == 0), position) {
            if rp >= top.start {
                let mut by_n: Vec<(usize, &Tier)> = tiers.iter().enumerate().filter(|(_, t)| t.divisions == 0).collect();
                by_n.sort_by_key(|(_, t)| t.top_n.unwrap_or(u32::MAX));
                if let Some((i, hit)) = by_n.into_iter().find(|(_, t)| pos <= t.top_n.unwrap_or(0)) {
                    return DisplayRank {
                        tier_id: hit.id.clone(),
                        name: hit.name.clone(),
                        division: None,
                        division_label: hit.name.clone(),
                        rp,
                        rp_into_division: None,
                        rp_for_next: None,
                        color: hit.color.clone(),
                        tier_index: i,
                        position: Some(pos),
                    };
                }
            }
        }
        let t = &tiers[idx];
        let width = t.division_rp;
        let d = clamp((rp - t.start).div_euclid(width), 0, t.divisions as i32 - 1);
        let into = rp - t.start - d * width;
        let label = ["I", "II", "III", "IV", "V"].get(d as usize).copied().unwrap_or("V");
        let last_idx = tiers.iter().rposition(|x| x.divisions > 0).unwrap_or(0);
        let last = idx == last_idx && d == t.divisions as i32 - 1;
        DisplayRank {
            tier_id: t.id.clone(),
            name: t.name.clone(),
            division: Some(d as u32 + 1),
            division_label: format!("{} {}", t.name, label),
            rp,
            rp_into_division: Some(into),
            rp_for_next: if last { None } else { Some(width) },
            color: t.color.clone(),
            tier_index: idx,
            position: None,
        }
    }

    /// 同じ相手から最近 n 回 RP を得たときの倍率（1 / 0.5 / 0）
    pub fn pair_scale(&self, recent_wins_vs_same: u32) -> f64 {
        if recent_wins_vs_same < self.pair_full_gains {
            1.0
        } else if recent_wins_vs_same < self.pair_half_until {
            0.5
        } else {
            0.0
        }
    }

    /// 1試合の結果を反映する。`op_mmr` は試合前の相手の MMR。`pair_scale` は勝ったときだけ使う
    pub fn apply_result(&self, me: &RankEntry, op_mmr: i32, won: bool, pair_scale: f64) -> RankChange {
        let expected = 1.0 / (1.0 + 10f64.powf((op_mmr - me.mmr) as f64 / self.elo_scale));
        let placing = me.placement_left > 0;
        let k = if placing { self.elo_placement_k } else { self.elo_k };
        let score = if won { 1.0 } else { 0.0 };
        let mmr = js_round(me.mmr as f64 + k * (score - expected)).max(100);
        let mut rp = me.rp;
        let mut placement_left = me.placement_left;
        let mut scale = 1.0;
        if placing {
            placement_left -= 1;
            if placement_left == 0 {
                rp = self.rp_from_mmr(mmr);
            }
        } else if won {
            scale = pair_scale;
            let gain = clamp(js_round(self.rp_win * (0.5 + (1.0 - expected))), self.rp_min_gain, self.rp_max_gain);
            rp += js_round(gain as f64 * scale);
        } else {
            rp -= clamp(js_round(self.rp_loss * (0.5 + expected)), self.rp_min_loss, self.rp_max_loss);
        }
        rp = rp.max(0);
        RankChange {
            entry: RankEntry {
                season: me.season,
                mmr,
                rp,
                peak_rp: me.peak_rp.max(rp),
                matches: me.matches + 1,
                wins: me.wins + u32::from(won),
                placement_left,
            },
            mmr_before: me.mmr,
            rp_before: me.rp,
            placement: placing,
            scale,
        }
    }

    /// 待ち始めて `waited_ms` たったときに許す MMR の差
    pub fn match_range(&self, waited_ms: i64) -> i32 {
        let c = &self.matchmaking;
        let steps = if c.step_ms > 0 { (waited_ms.max(0) / c.step_ms) as i32 } else { 0 };
        c.max_range.min(c.base_range + steps * c.expand_per_step)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse_json;

    fn cfg() -> RankConfig {
        RankConfig::from_json(&parse_json(include_str!("../../../../data/ranks.json")).unwrap()).unwrap()
    }
    fn seasons() -> SeasonConfig {
        SeasonConfig::from_json(&parse_json(include_str!("../../../../data/seasons.json")).unwrap()).unwrap()
    }

    #[test]
    fn js_round_matches_math_round() {
        assert_eq!(js_round(2.5), 3);
        assert_eq!(js_round(-2.5), -2);
        assert_eq!(js_round(-2.6), -3);
        assert_eq!(js_round(0.49), 0);
    }

    #[test]
    fn parses_epoch_and_seasons() {
        assert_eq!(parse_utc_ms("1970-01-02T00:00:00Z"), Some(DAY_MS));
        assert_eq!(parse_utc_ms("2026-11-01T00:00:00Z"), Some(1_793_491_200_000));
        let s = seasons();
        assert_eq!(s.season_at(s.epoch_ms).0, 1);
        assert_eq!(s.season_at(s.epoch_ms + s.length_days * DAY_MS).0, 2);
        assert_eq!(s.season_at(s.epoch_ms - 1).0, 1, "起点より前もシーズン1");
    }

    #[test]
    fn display_rank_divisions_and_top_tiers() {
        let c = cfg();
        let r = c.display_rank(0, None);
        assert_eq!((r.tier_id.as_str(), r.division, r.division_label.as_str()), ("iron", Some(1), "Iron I"));
        let r = c.display_rank(450, None);
        assert_eq!((r.tier_id.as_str(), r.division, r.rp_into_division), ("bronze", Some(2), Some(50)));
        let r = c.display_rank(1799, None);
        assert_eq!((r.tier_id.as_str(), r.division, r.rp_for_next), ("diamond", Some(3), None));
        // 1800 以上でも順位が無ければ Diamond III のまま
        assert_eq!(c.display_rank(2000, None).tier_id, "diamond");
        assert_eq!(c.display_rank(2000, Some(50)).tier_id, "champion");
        assert_eq!(c.display_rank(2000, Some(300)).tier_id, "master");
        assert_eq!(c.display_rank(2000, Some(900)).tier_id, "diamond");
    }

    #[test]
    fn placement_then_rp_from_mmr() {
        let c = cfg();
        let mut e = c.new_entry(&seasons(), 1, None);
        assert_eq!((e.mmr, e.rp, e.placement_left), (1000, 0, 5));
        for _ in 0..5 {
            let ch = c.apply_result(&e, 1000, true, 1.0);
            assert!(ch.placement);
            e = ch.entry;
        }
        assert_eq!(e.placement_left, 0);
        // 同じ相手 MMR 1000 に5連勝（K=64）。旧サーバーの JS の式で計算した値
        assert_eq!(e.mmr, 1133);
        assert_eq!(e.rp, c.rp_from_mmr(1133));
        assert_eq!(e.rp, 666);
        assert_eq!((e.matches, e.wins), (5, 5));
    }

    #[test]
    fn ranked_win_and_loss_rp_bounds() {
        let c = cfg();
        let me = RankEntry { season: 1, mmr: 1000, rp: 500, peak_rp: 500, matches: 10, wins: 5, placement_left: 0 };
        let w = c.apply_result(&me, 1000, true, 1.0);
        assert_eq!(w.entry.rp, 522); // 22 × (0.5 + 0.5)
        assert_eq!(w.entry.mmr, 1016);
        let l = c.apply_result(&me, 1000, false, 1.0);
        assert_eq!(l.entry.rp, 482);
        assert_eq!(l.entry.peak_rp, 500);
        // 格上に勝つと多くもらえ、上限で止まる
        assert_eq!(c.apply_result(&me, 2000, true, 1.0).entry.rp, 500 + 33);
        // 同じ相手に何度も勝つと半分・0
        assert_eq!(c.apply_result(&me, 1000, true, 0.5).entry.rp, 511);
        assert_eq!(c.apply_result(&me, 1000, true, 0.0).entry.rp, 500);
        // RP は0未満にならない
        let low = RankEntry { rp: 3, ..me.clone() };
        assert_eq!(c.apply_result(&low, 1000, false, 1.0).entry.rp, 0);
        assert_eq!(c.pair_scale(2), 1.0);
        assert_eq!(c.pair_scale(3), 0.5);
        assert_eq!(c.pair_scale(6), 0.0);
    }

    #[test]
    fn soft_reset_and_range() {
        let c = cfg();
        let s = seasons();
        let prev = RankEntry { season: 1, mmr: 1400, rp: 900, peak_rp: 900, matches: 30, wins: 20, placement_left: 0 };
        let e = c.new_entry(&s, 2, Some(&prev));
        assert_eq!((e.mmr, e.rp, e.placement_left), (1200, 800, 2));
        assert_eq!(c.match_range(0), 100);
        assert_eq!(c.match_range(25_000), 200);
        assert_eq!(c.match_range(10_000_000), 800);
    }
}
