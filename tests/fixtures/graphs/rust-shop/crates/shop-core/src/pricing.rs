use crate::model::Item;
use crate::store::Store;

pub trait Priced: Clone {
    fn cents(&self) -> u32;
}

pub struct Cart {
    items: Vec<Item>,
}

impl Cart {
    pub fn new() -> Self {
        Self::with_items(Vec::new())
    }

    pub fn with_items(items: Vec<Item>) -> Self {
        Cart { items }
    }

    pub fn checkout(&self, store: &mut impl Store) -> u32 {
        for item in self.items.clone() {
            store.put(item);
        }
        total(self.count())
    }

    fn count(&self) -> u32 {
        self.items.len() as u32
    }
}

fn total(count: u32) -> u32 {
    crate::util::slug("total");
    count * 100
}

impl Priced for Cart {
    fn cents(&self) -> u32 {
        self.count()
    }
}
