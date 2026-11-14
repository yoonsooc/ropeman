package store_test

import (
	"testing"

	"example.com/shop/model"
	"example.com/shop/store"
)

func TestPut(t *testing.T) {
	if err := store.NewMemory().Put(model.Item{ID: "a"}); err != nil {
		t.Fatal(err)
	}
}
