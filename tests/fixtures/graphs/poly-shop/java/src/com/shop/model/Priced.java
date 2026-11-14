package com.shop.model;

public interface Priced extends Comparable<Priced> {
    int cents();
}
