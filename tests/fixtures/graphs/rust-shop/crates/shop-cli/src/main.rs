mod args;

use shop_core::{Item, store::Store};
use shop_core::store::memory::MemoryStore;
use cli_kit::banner;
use self::args::Args;
use serde::Serialize;
pub(crate) use ::std::io;

pub const VERSION: &str = "0.1.0";

fn main() {
    let _ = (banner(), Args::parse(), io::stdout());
}
