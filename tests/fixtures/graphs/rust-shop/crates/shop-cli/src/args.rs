use crate::VERSION;
use shop_core::store::{self, Store as StoreTrait};

pub struct Args;

impl Args {
    pub fn parse() -> Self {
        let _ = VERSION;
        Args
    }
}
