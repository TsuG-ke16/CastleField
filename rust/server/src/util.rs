//! サーバーのちょっとした道具

use std::fs;
use std::io::Read;
use std::time::{SystemTime, UNIX_EPOCH};

/// 予想しにくい16進の文字列（席の鍵・ID用）。/dev/urandom が読めなければ、時刻と RandomState の混ぜ合わせ
pub fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    let ok = fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut buf)).is_ok();
    if !ok {
        use std::collections::hash_map::RandomState;
        use std::hash::{BuildHasher, Hasher};
        for (i, chunk) in buf.chunks_mut(8).enumerate() {
            let mut h = RandomState::new().build_hasher();
            h.write_u128(SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
            h.write_usize(i);
            let v = h.finish().to_le_bytes();
            chunk.copy_from_slice(&v[..chunk.len()]);
        }
    }
    buf.iter().map(|b| format!("{b:02x}")).collect()
}
