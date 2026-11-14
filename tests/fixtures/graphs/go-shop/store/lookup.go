package store

import "example.com/shop/model"

func (m *Memory) Get(id string) (model.Item, bool) {
	item, ok := m.items[id]
	return item, ok
}

func (m *Memory) Total() int {
	sum := 0
	for _, item := range m.all() {
		sum += model.PriceOf(item)
	}
	return sum
}

func (m *Memory) all() []model.Item {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]model.Item, 0, len(m.items))
	for _, item := range m.items {
		out = append(out, item)
	}
	return out
}

func Count(m *Memory) int {
	return len(m.all())
}
