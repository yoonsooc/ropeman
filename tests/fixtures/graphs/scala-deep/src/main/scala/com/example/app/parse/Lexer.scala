package com.example.app.parse

class Lexer {
  def tokens(text: String): List[String] = text.split(" ").toList
}
