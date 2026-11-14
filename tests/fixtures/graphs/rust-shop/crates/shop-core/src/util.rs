pub fn slug(text: &str) -> String {
    text.to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Item;
}
