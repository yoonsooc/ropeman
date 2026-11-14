package api

import (
	"net/http"

	. "example.com/shop/model"
	"example.com/shop/internal/ids"
	"example.com/shop/store"
	"example.com/shop/tools/rules"
)

func Routes(s store.Store) http.Handler {
	_ = rules.Check(Item{ID: ids.Next()})
	return http.NewServeMux()
}

func price(item Item) int {
	return PriceOf(item)
}

func label(PriceOf func(Item) int, item Item) int {
	return PriceOf(item)
}
