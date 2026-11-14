class Cart < Collection
  def total
    sum + Tax.rate
  end

  def checkout
    self.total
    Receipt.new
  end
end
