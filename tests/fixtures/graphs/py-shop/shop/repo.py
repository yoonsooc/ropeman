import json

from .models import Order


class OrderRepo:
    def __init__(self):
        self.rows = []

    def save(self, order: Order):
        payload = {"id": order.id, "total": order.total()}
        self._write(json.dumps(payload))

    def _write(self, text):
        self.rows.append(text)
