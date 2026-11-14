use super::Store;
use crate::model::*;
use super::super::util::slug;
use std::collections::HashMap;

pub struct MemoryStore {
    items: HashMap<String, Item>,
}

impl Store for MemoryStore {
    fn put(&mut self, item: Item) {
        self.items.insert(slug(&item.id), item);
    }
}
