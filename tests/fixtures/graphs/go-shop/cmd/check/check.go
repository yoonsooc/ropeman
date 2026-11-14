package main

import ()

import (
	"example.com/shop/codec"
	"example.com/shop/tooling/rules"
)

func main() {
	_, _ = codec.Encode(nil)
	_ = rules.Check
}
