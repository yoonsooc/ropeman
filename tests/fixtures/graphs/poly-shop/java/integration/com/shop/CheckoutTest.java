package com.shop;

public class CheckoutTest {
    public int fees() {
        Checkout checkout = new Checkout();
        return Pricing.fee();
    }
}
