package com.example.app.parse

import com.example.app.parse.ast.Node

class Parser extends Lexer {
  def parse(text: String): Node = new Node(tokens(text))
}
