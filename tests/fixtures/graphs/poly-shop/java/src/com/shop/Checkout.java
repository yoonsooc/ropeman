package com.shop;

import com.shop.model.Item;

public class Checkout {
    public int total(Item item) {
        Item copy = new Item();
        return item.cents() + Pricing.fee() + copy.cents();
    }
}
