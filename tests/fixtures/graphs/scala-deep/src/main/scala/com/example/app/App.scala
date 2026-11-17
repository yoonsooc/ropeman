package com.example.app

import com.example.app.parse.Parser
import com.example.app.store.memory.MemoryStore

object App {
  def run(text: String): Int = {
    val store = new MemoryStore()
    store.put(new Parser().parse(text))
  }
}
