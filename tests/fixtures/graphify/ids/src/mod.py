def outer():
    def inner():
        return 1
    return inner()


class A:
    def run(self):
        return 1

    class Inner:
        def run(self):
            return 2


class B:
    def run(self):
        return 3

    @property
    def size(self):
        return 1


def run():
    return 4
