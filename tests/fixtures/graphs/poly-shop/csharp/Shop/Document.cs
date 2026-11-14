namespace Shop
{
    public interface IPriced { int Cents(); }

    public abstract class Document
    {
        protected int Base() { return Tax.Rate(); }
    }

    public static class Tax
    {
        public static int Rate() { return 1; }
    }
}
