from . import models


def build(models):
    return models.Order()


def make():
    return models.Order()


class Job:
    def run(self):
        self.on_done()


class Hooks:
    def on_done(self):
        return None
