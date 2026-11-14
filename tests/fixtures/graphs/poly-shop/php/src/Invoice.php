<?php
namespace App;

class Invoice extends Document implements Payable
{
    public function total()
    {
        return $this->base() + Tax::rate() + helper();
    }
}
