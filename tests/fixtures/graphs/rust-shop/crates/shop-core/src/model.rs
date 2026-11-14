use std::fmt;

use crate::util::slug;

pub struct Item {
    pub id: String,
}

impl fmt::Display for Item {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", slug(&self.id))
    }
}
