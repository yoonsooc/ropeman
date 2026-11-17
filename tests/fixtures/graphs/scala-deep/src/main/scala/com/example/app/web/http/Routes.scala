package com.example.app.web.http

import com.example.app.App
import com.example.app.web.http.json.Codec

object Routes {
  def handle(body: String): String = Codec.encode(App.run(body))
}
