<?php
namespace App;

interface Payable
{
    public function total();
}

abstract class Document
{
    protected function base()
    {
        return 1;
    }
}

class Tax
{
    public static function rate()
    {
        return 2;
    }
}

function helper()
{
    return new Tax();
}
