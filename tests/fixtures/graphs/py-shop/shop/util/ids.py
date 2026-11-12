from ..pricing import ROUND

_counter = 0


def new_id(prefix):
    global _counter
    _counter += 1
    return f"{prefix}-{_counter:0{ROUND}d}"
