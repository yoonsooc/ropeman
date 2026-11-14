package store

import "testing"

func TestCount(t *testing.T) {
	m := NewMemory()
	if Count(m) != 0 || m.Total() != 0 {
		t.Fatal("not empty")
	}
}
