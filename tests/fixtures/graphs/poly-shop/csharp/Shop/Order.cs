namespace Shop
{
    public class Order : Document, IPriced
    {
        public int Cents() { return Round(Base()); }
        private int Round(int v) { return v; }
    }

    public struct Money : IPriced
    {
        public int Cents() { return 0; }
    }
}
