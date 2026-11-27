/// Deterministic Mulberry32 PRNG matching JS `mulberry32(seed)`.
#[derive(Debug, Clone)]
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    pub fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6D2B_79F5);
        let mut t = self.state ^ (self.state >> 15);
        t = t.wrapping_mul(self.state | 1);
        t ^= t.wrapping_add(t.wrapping_mul((t ^ (t >> 7)) | 61));
        t ^ (t >> 14)
    }

    pub fn next_f64(&mut self) -> f64 {
        (self.next_u32() as f64) / 4_294_967_296.0
    }

    pub fn next_usize(&mut self, len: usize) -> usize {
        if len <= 1 {
            return 0;
        }
        ((self.next_f64() * (len as f64)).floor() as usize).min(len - 1)
    }

    pub fn roll_d6(&mut self) -> u32 {
        (self.next_usize(6) + 1) as u32
    }
}
