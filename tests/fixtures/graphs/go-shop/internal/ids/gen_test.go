package ids

import "testing"

func TestNext(t *testing.T) {
	if Next() == "" {
		t.Fatal("empty")
	}
}
