package store

import "example.com/shop/model"

import (
	"sync"
)

type Memory struct {
	mu    sync.Mutex
	items map[string]model.Item
}

func NewMemory() *Memory {
	return &Memory{items: map[string]model.Item{}}
}

func (m *Memory) Put(item model.Item) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.items[item.ID] = item
	return nil
}
