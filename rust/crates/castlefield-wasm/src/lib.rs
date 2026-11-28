use std::sync::{Mutex, OnceLock};

use castlefield_core::ai::{run_cpu_turn, CpuStrategy};
use castlefield_core::data::GameConfig;
use castlefield_core::events::events_to_json_string;
use castlefield_core::game::Game;
use castlefield_core::json::{obj, JsonValue};
use castlefield_core::model::PlayTarget;
use castlefield_core::rng::Mulberry32;
use castlefield_core::sim::run_simulation;

struct WasmGame {
    inner: Game,
    cpu_rng: Mulberry32,
}

static GAMES: OnceLock<Mutex<Vec<Option<WasmGame>>>> = OnceLock::new();
static LAST_BUF: OnceLock<Mutex<Vec<u8>>> = OnceLock::new();
static LAST_ERR: OnceLock<Mutex<Vec<u8>>> = OnceLock::new();

fn games() -> &'static Mutex<Vec<Option<WasmGame>>> {
    GAMES.get_or_init(|| Mutex::new(Vec::new()))
}

fn last_buf() -> &'static Mutex<Vec<u8>> {
    LAST_BUF.get_or_init(|| Mutex::new(Vec::new()))
}

fn last_err() -> &'static Mutex<Vec<u8>> {
    LAST_ERR.get_or_init(|| Mutex::new(Vec::new()))
}

fn set_output(s: String) -> i32 {
    if let Ok(mut buf) = last_buf().lock() {
        *buf = s.into_bytes();
    }
    0
}

fn set_error(msg: impl Into<String>) -> i32 {
    if let Ok(mut buf) = last_err().lock() {
        *buf = msg.into().into_bytes();
    }
    -1
}

unsafe fn read_str(ptr: *const u8, len: usize) -> Result<String, i32> {
    if len == 0 {
        return Ok(String::new());
    }
    if ptr.is_null() {
        return Err(set_error("null pointer"));
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
    std::str::from_utf8(slice)
        .map(|s| s.to_string())
        .map_err(|e| set_error(format!("invalid utf8: {e}")))
}

fn with_game_mut<F>(handle: i32, f: F) -> i32
where
    F: FnOnce(&mut WasmGame) -> String,
{
    if handle <= 0 {
        return set_error("invalid game handle");
    }
    let idx = (handle - 1) as usize;
    let Ok(mut guard) = games().lock() else {
        return set_error("mutex poisoned");
    };
    let Some(Some(game)) = guard.get_mut(idx) else {
        return set_error("game handle not found");
    };
    let out = f(game);
    set_output(out)
}

fn with_game<F>(handle: i32, f: F) -> i32
where
    F: FnOnce(&WasmGame) -> String,
{
    if handle <= 0 {
        return set_error("invalid game handle");
    }
    let idx = (handle - 1) as usize;
    let Ok(guard) = games().lock() else {
        return set_error("mutex poisoned");
    };
    let Some(Some(game)) = guard.get(idx) else {
        return set_error("game handle not found");
    };
    let out = f(game);
    set_output(out)
}

#[no_mangle]
pub extern "C" fn cf_alloc(len: usize) -> *mut u8 {
    let mut vec = Vec::<u8>::with_capacity(len);
    let ptr = vec.as_mut_ptr();
    std::mem::forget(vec);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn cf_dealloc(ptr: *mut u8, cap: usize) {
    if !ptr.is_null() && cap > 0 {
        unsafe {
            let _ = Vec::from_raw_parts(ptr, 0, cap);
        }
    }
}

#[no_mangle]
pub extern "C" fn cf_last_ptr() -> *const u8 {
    last_buf()
        .lock()
        .map(|b| b.as_ptr())
        .unwrap_or(std::ptr::null())
}

#[no_mangle]
pub extern "C" fn cf_last_len() -> usize {
    last_buf().lock().map(|b| b.len()).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn cf_last_err_ptr() -> *const u8 {
    last_err()
        .lock()
        .map(|b| b.as_ptr())
        .unwrap_or(std::ptr::null())
}

#[no_mangle]
pub extern "C" fn cf_last_err_len() -> usize {
    last_err().lock().map(|b| b.len()).unwrap_or(0)
}

#[no_mangle]
pub unsafe extern "C" fn cf_new(cfg_ptr: *const u8, cfg_len: usize) -> i32 {
    let Ok(cfg_str) = (unsafe { read_str(cfg_ptr, cfg_len) }) else {
        return -1;
    };
    let config = match GameConfig::from_json_str(&cfg_str) {
        Ok(c) => c,
        Err(e) => return set_error(format!("Invalid GameConfig JSON: {e}")),
    };
    let seed = config.seed;
    let inner = match Game::new(config) {
        Ok(g) => g,
        Err(e) => return set_error(e),
    };
    let wg = WasmGame {
        inner,
        cpu_rng: Mulberry32::new(seed ^ 0x51ED_270B),
    };
    let Ok(mut guard) = games().lock() else {
        return set_error("mutex poisoned");
    };
    for (idx, slot) in guard.iter_mut().enumerate() {
        if slot.is_none() {
            *slot = Some(wg);
            return (idx + 1) as i32;
        }
    }
    guard.push(Some(wg));
    guard.len() as i32
}

#[no_mangle]
pub extern "C" fn cf_free(handle: i32) {
    if handle <= 0 {
        return;
    }
    if let Ok(mut guard) = games().lock() {
        if let Some(slot) = guard.get_mut((handle - 1) as usize) {
            *slot = None;
        }
    }
}

#[no_mangle]
pub extern "C" fn cf_start(handle: i32) -> i32 {
    with_game_mut(handle, |g| events_to_json_string(&g.inner.start()))
}

#[no_mangle]
pub extern "C" fn cf_drain_events(handle: i32) -> i32 {
    with_game_mut(handle, |g| events_to_json_string(&g.inner.drain_events()))
}

#[no_mangle]
pub unsafe extern "C" fn cf_get_state(handle: i32, viewer_ptr: *const u8, viewer_len: usize) -> i32 {
    let viewer = if viewer_len == 0 {
        None
    } else {
        match unsafe { read_str(viewer_ptr, viewer_len) } {
            Ok(s) => Some(s),
            Err(code) => return code,
        }
    };
    with_game(handle, |g| g.inner.get_state(viewer.as_deref()).to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_can_play_card(
    handle: i32,
    card_ptr: *const u8,
    card_len: usize,
    tgt_ptr: *const u8,
    tgt_len: usize,
) -> i32 {
    let Ok(card_id) = (unsafe { read_str(card_ptr, card_len) }) else {
        return -1;
    };
    let tgt = if tgt_len == 0 {
        None
    } else {
        unsafe { read_str(tgt_ptr, tgt_len) }.ok().and_then(|s| PlayTarget::from_json_str(&s))
    };
    with_game(handle, |g| g.inner.can_play_card(&card_id, tgt.as_ref()).to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_get_targets(handle: i32, card_ptr: *const u8, card_len: usize) -> i32 {
    let Ok(card_id) = (unsafe { read_str(card_ptr, card_len) }) else {
        return -1;
    };
    with_game(handle, |g| {
        let list = g.inner.get_targets(&card_id);
        JsonValue::Array(list.into_iter().map(|t| t.to_json()).collect()).to_json_string()
    })
}

#[no_mangle]
pub unsafe extern "C" fn cf_play_card(
    handle: i32,
    card_ptr: *const u8,
    card_len: usize,
    tgt_ptr: *const u8,
    tgt_len: usize,
) -> i32 {
    let Ok(card_id) = (unsafe { read_str(card_ptr, card_len) }) else {
        return -1;
    };
    let tgt = if tgt_len == 0 {
        None
    } else {
        unsafe { read_str(tgt_ptr, tgt_len) }.ok().and_then(|s| PlayTarget::from_json_str(&s))
    };
    with_game_mut(handle, |g| g.inner.play_card(&card_id, tgt.as_ref()).to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_mulligan(
    handle: i32,
    pid_ptr: *const u8,
    pid_len: usize,
    ids_ptr: *const u8,
    ids_len: usize,
) -> i32 {
    let Ok(pid) = (unsafe { read_str(pid_ptr, pid_len) }) else {
        return -1;
    };
    let Ok(ids_str) = (unsafe { read_str(ids_ptr, ids_len) }) else {
        return -1;
    };
    let ids = parse_string_list(&ids_str);
    with_game_mut(handle, |g| g.inner.mulligan(&pid, &ids).to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_discard(handle: i32, ids_ptr: *const u8, ids_len: usize) -> i32 {
    let Ok(ids_str) = (unsafe { read_str(ids_ptr, ids_len) }) else {
        return -1;
    };
    let ids = parse_string_list(&ids_str);
    with_game_mut(handle, |g| g.inner.discard(&ids).to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_can_buy_upgrade(handle: i32, uid_ptr: *const u8, uid_len: usize) -> i32 {
    let Ok(uid) = (unsafe { read_str(uid_ptr, uid_len) }) else {
        return -1;
    };
    with_game(handle, |g| g.inner.can_buy_upgrade(&uid).to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_buy_upgrade(handle: i32, uid_ptr: *const u8, uid_len: usize) -> i32 {
    let Ok(uid) = (unsafe { read_str(uid_ptr, uid_len) }) else {
        return -1;
    };
    with_game_mut(handle, |g| g.inner.buy_upgrade(&uid).to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_can_defend(
    handle: i32,
    card_ptr: *const u8,
    card_len: usize,
    tgt_ptr: *const u8,
    tgt_len: usize,
) -> i32 {
    let Ok(card_id) = (unsafe { read_str(card_ptr, card_len) }) else {
        return -1;
    };
    let tgt = if tgt_len == 0 {
        None
    } else {
        unsafe { read_str(tgt_ptr, tgt_len) }.ok().and_then(|s| PlayTarget::from_json_str(&s))
    };
    with_game(handle, |g| g.inner.can_defend(&card_id, tgt.as_ref()).to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_get_defense_targets(handle: i32, card_ptr: *const u8, card_len: usize) -> i32 {
    let Ok(card_id) = (unsafe { read_str(card_ptr, card_len) }) else {
        return -1;
    };
    with_game(handle, |g| {
        let list = g.inner.get_defense_targets(&card_id);
        JsonValue::Array(list.into_iter().map(|t| t.to_json()).collect()).to_json_string()
    })
}

#[no_mangle]
pub unsafe extern "C" fn cf_defend(
    handle: i32,
    card_ptr: *const u8,
    card_len: usize,
    tgt_ptr: *const u8,
    tgt_len: usize,
) -> i32 {
    let Ok(card_id) = (unsafe { read_str(card_ptr, card_len) }) else {
        return -1;
    };
    let tgt = if tgt_len == 0 {
        None
    } else {
        unsafe { read_str(tgt_ptr, tgt_len) }.ok().and_then(|s| PlayTarget::from_json_str(&s))
    };
    with_game_mut(handle, |g| g.inner.defend(&card_id, tgt.as_ref()).to_json_string())
}

#[no_mangle]
pub extern "C" fn cf_pass_defense(handle: i32) -> i32 {
    with_game_mut(handle, |g| g.inner.pass_defense().to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_can_fuse(
    handle: i32,
    a_ptr: *const u8,
    a_len: usize,
    b_ptr: *const u8,
    b_len: usize,
) -> i32 {
    let Ok(a) = (unsafe { read_str(a_ptr, a_len) }) else {
        return -1;
    };
    let Ok(b) = (unsafe { read_str(b_ptr, b_len) }) else {
        return -1;
    };
    with_game(handle, |g| g.inner.can_fuse(&a, &b).to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_fuse(
    handle: i32,
    a_ptr: *const u8,
    a_len: usize,
    b_ptr: *const u8,
    b_len: usize,
) -> i32 {
    let Ok(a) = (unsafe { read_str(a_ptr, a_len) }) else {
        return -1;
    };
    let Ok(b) = (unsafe { read_str(b_ptr, b_len) }) else {
        return -1;
    };
    with_game_mut(handle, |g| g.inner.fuse(&a, &b).to_json_string())
}

#[no_mangle]
pub extern "C" fn cf_end_turn(handle: i32) -> i32 {
    with_game_mut(handle, |g| g.inner.end_turn().to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_surrender(handle: i32, pid_ptr: *const u8, pid_len: usize) -> i32 {
    let Ok(pid) = (unsafe { read_str(pid_ptr, pid_len) }) else {
        return -1;
    };
    with_game_mut(handle, |g| g.inner.surrender(&pid).to_json_string())
}

#[no_mangle]
pub unsafe extern "C" fn cf_run_cpu_turn(
    handle: i32,
    pid_ptr: *const u8,
    pid_len: usize,
    lv_ptr: *const u8,
    lv_len: usize,
) -> i32 {
    let Ok(pid) = (unsafe { read_str(pid_ptr, pid_len) }) else {
        return -1;
    };
    let Ok(lv) = (unsafe { read_str(lv_ptr, lv_len) }) else {
        return -1;
    };
    with_game_mut(handle, |g| {
        let strat = CpuStrategy::from_level(&lv);
        run_cpu_turn(&mut g.inner, &pid, strat, &mut g.cpu_rng);
        obj(vec![("ok", JsonValue::Bool(true))]).to_json_string()
    })
}

#[no_mangle]
pub unsafe extern "C" fn cf_run_benchmark(
    cfg_ptr: *const u8,
    cfg_len: usize,
    games_count: u32,
    seed: u32,
) -> i32 {
    let Ok(cfg_str) = (unsafe { read_str(cfg_ptr, cfg_len) }) else {
        return -1;
    };
    let config = match GameConfig::from_json_str(&cfg_str) {
        Ok(c) => c,
        Err(e) => return set_error(format!("Invalid GameConfig JSON: {e}")),
    };
    let summary = run_simulation(&config, games_count, seed);
    set_output(summary.to_json_string())
}

fn parse_string_list(s: &str) -> Vec<String> {
    match castlefield_core::json::parse_json(s) {
        Ok(JsonValue::Array(arr)) => arr
            .into_iter()
            .filter_map(|v| v.as_str().map(|x| x.to_string()))
            .collect(),
        _ => Vec::new(),
    }
}
