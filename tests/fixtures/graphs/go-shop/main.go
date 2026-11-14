package main

import (
	"fmt"

	"example.com/shop/legacy"
	"example.com/shop/store"
	api "example.com/shop/web/api"
	_ "example.com/shop/plugins/audit"
	"github.com/google/uuid"
)

func main() {
	s := store.NewMemory()
	fmt.Println(api.Routes(s), uuid.NewString(), legacy.Version)
}
