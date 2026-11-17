package com.example.app.store.memory

import com.example.app.parse.ast.Node

class MemoryStore extends Cache {
  def put(node: Node): Int = remember(node.parts.size)
}
