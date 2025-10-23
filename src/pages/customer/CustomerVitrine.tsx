import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export interface CartItem {
  product: any;
  quantity: number;
}

const CustomerVitrine = () => {
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartItem[]>([]);

  const { data: products, isLoading } = useQuery({
    queryKey: ["catalog-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_products")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const addToCart = (product: any) => {
    const existingItem = cart.find((item) => item.product.id === product.id);
    
    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    
    toast.success(`${product.name} adicionado ao carrinho`);
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.product.points_price) * item.quantity,
    0
  );

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Vitrine de Produtos</h2>
          <p className="text-muted-foreground">Resgate seus pontos por produtos</p>
        </div>
        {cartItemCount > 0 && (
          <Button
            size="lg"
            onClick={() => navigate("/customer/checkout", { state: { cart } })}
            className="gap-2"
          >
            <ShoppingCart />
            Finalizar Resgate ({cartItemCount}) - {cartTotal.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} pts
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : products && products.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="line-clamp-1">{product.name}</CardTitle>
                    {product.category && (
                      <Badge variant="secondary" className="mt-2">
                        {product.category}
                      </Badge>
                    )}
                  </div>
                  {product.track_inventory && (
                    <Badge variant={product.stock_qty > 0 ? "outline" : "destructive"}>
                      <Package className="mr-1 h-3 w-3" />
                      {product.stock_qty}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="line-clamp-3 min-h-[3.6rem]">
                  {product.description || "Produto disponível para resgate"}
                </CardDescription>
                <div className="mt-4">
                  <p className="text-2xl font-bold text-primary">
                    {Number(product.points_price).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="text-sm">pontos</span>
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  onClick={() => addToCart(product)}
                  disabled={product.track_inventory && product.stock_qty === 0}
                >
                  <ShoppingCart className="mr-2" />
                  {product.track_inventory && product.stock_qty === 0
                    ? "Sem Estoque"
                    : "Adicionar"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              Nenhum produto disponível no momento
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CustomerVitrine;
