package com.shop.model;

public class Item extends Entity implements Priced {
    public int cents() {
        return round(base());
    }

    private int round(int value) {
        return value;
    }
}
