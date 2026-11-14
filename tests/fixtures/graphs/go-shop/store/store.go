package store

import (
	"errors"

	"example.com/shop/model"
)

var ErrMissing = errors.New("missing")

type Store interface {
	Put(item model.Item) error
}
