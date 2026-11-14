use shop_core::Item;
use shop_core::model;
use shop_cli::Args;
use core_lib::store::Store;
use kit::banner;

fn main() {
    let _ = model::Item { id: String::new() };
}

fn cart() -> shop_core::pricing::Cart {
    shop_core::pricing::Cart::new()
}

fn pay(cart: &shop_core::pricing::Cart, store: &mut impl Store) -> u32 {
    cart.checkout(store)
}
