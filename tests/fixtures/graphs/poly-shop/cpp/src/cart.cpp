#include "store.hpp"

class Cart : public Store, private Auditable {
 public:
  int total() { return count() + fee(); }
};

int fee() { return 1; }

int checkout(Cart& cart) { return cart.total(); }
