import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { usePortalBalance } from "@/hooks/usePortalBalance";
import { CartItem } from "./PortalVitrine";
import { Minus, Plus, Trash2 } from "lucide-react";
import { getUserActorInfo } from "@/lib/userRole";

const PortalCheckout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: balance } = usePortalBalance();

  const [cart, setCart] = useState<CartItem[]>(location.state?.cart || []);
  const [shippingAddress, setShippingAddress] = useState("");
  const [pickupStore, setPickupStore] = useState("");

  const cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.product.points_price) * item.quantity,
    0
  );

  const updateQuantity = (productId: string, delta: number) => {
    setCart(
      cart
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  const createRedemptionMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { actorType, actorId } = await getUserActorInfo();
      if (!actorType || !actorId) throw new Error("Actor not found");

      // Create redemption
      const actorIdField = actorType === "customer" ? "actor_id_customer" : "actor_id_specifier";
      const { data: redemption, error: redemptionError } = await supabase
        .from("redemptions")
        .insert({
          actor_type: actorType,
          [actorIdField]: actorId,
          total_points: cartTotal,
          shipping_info: shippingAddress ? { address: shippingAddress } : null,
          pickup_store: pickupStore || null,
        })
        .select()
        .single();

      if (redemptionError) throw redemptionError;

      // Create redemption items
      const items = cart.map((item) => ({
        redemption_id: redemption.id,
        product_id: item.product.id,
        qty: item.quantity,
        points_price: item.product.points_price,
        subtotal_points: Number(item.product.points_price) * item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("redemption_items")
        .insert(items);

      if (itemsError) throw itemsError;

      // Create ledger entry
      const { error: ledgerError } = await supabase
        .from("points_ledger")
        .insert({
          actor_type: actorType,
          [actorIdField]: actorId,
          type: "redeem",
          points: -cartTotal,
          ref: `Resgate #${redemption.id.slice(0, 8)}`,
        });

      if (ledgerError) throw ledgerError;

      return redemption;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-balance"] });
      queryClient.invalidateQueries({ queryKey: ["portal-redemptions"] });
      toast.success("Resgate solicitado com sucesso!");
      navigate("/portal/resgates");
    },
    onError: (error) => {
      toast.error(`Erro ao criar resgate: ${error.message}`);
    },
  });

  const handleCheckout = () => {
    if (!balance) return;

    if (cartTotal > balance.redeemable) {
      toast.error("Pontos insuficientes para este resgate");
      return;
    }

    if (cart.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }

    createRedemptionMutation.mutate();
  };

  if (cart.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold">Checkout</h2>
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              Seu carrinho está vazio
            </p>
            <div className="flex justify-center mt-4">
              <Button onClick={() => navigate("/portal/vitrine")}>
                Ver Produtos
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Finalizar Resgate</h2>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Itens do Resgate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center gap-4 pb-4 border-b last:border-b-0">
                  <div className="flex-1">
                    <h4 className="font-medium">{item.product.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {Number(item.product.points_price).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })} pts cada
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => updateQuantity(item.product.id, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-12 text-center font-medium">{item.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => updateQuantity(item.product.id, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() => removeItem(item.product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-right min-w-[100px]">
                    <p className="font-bold">
                      {(Number(item.product.points_price) * item.quantity).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })} pts
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Entrega ou Retirada</CardTitle>
              <CardDescription>Escolha como deseja receber seus produtos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="shipping">Endereço de Entrega (opcional)</Label>
                <Input
                  id="shipping"
                  placeholder="Rua, número, cidade..."
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pickup">Loja para Retirada (opcional)</Label>
                <Input
                  id="pickup"
                  placeholder="Nome da loja..."
                  value={pickupStore}
                  onChange={(e) => setPickupStore(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Seus pontos</span>
                  <span className="font-medium">
                    {balance?.redeemable.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })} pts
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total do resgate</span>
                  <span className="font-bold text-primary">
                    {cartTotal.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })} pts
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo após resgate</span>
                  <span className={`font-medium ${(balance?.redeemable || 0) - cartTotal < 0 ? "text-destructive" : "text-accent"}`}>
                    {((balance?.redeemable || 0) - cartTotal).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })} pts
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                size="lg"
                onClick={handleCheckout}
                disabled={!balance || cartTotal > balance.redeemable || createRedemptionMutation.isPending}
              >
                {createRedemptionMutation.isPending ? "Processando..." : "Confirmar Resgate"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PortalCheckout;
