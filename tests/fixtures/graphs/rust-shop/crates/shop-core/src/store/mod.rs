pub mod memory;

use crate::model::Item;

pub trait Store {
    fn put(&mut self, item: Item);
}
