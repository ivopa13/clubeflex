import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getUserActorInfo } from "@/lib/userRole";

const PortalResgates = () => {
  const { data: redemptions, isLoading } = useQuery({
    queryKey: ["portal-redemptions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { actorType, actorId } = await getUserActorInfo();
      if (!actorType || !actorId) throw new Error("Actor not found");

      const actorIdColumn = actorType === "customer" ? "actor_id_customer" : "actor_id_specifier";
      const { data, error } = await supabase
        .from("redemptions")
        .select(`
          *,
          redemption_items (
            *,
            product:catalog_products (*)
          )
        `)
        .eq("actor_type", actorType)
        .eq(actorIdColumn, actorId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    requested: { label: "Solicitado", variant: "secondary" },
    approved: { label: "Aprovado", variant: "default" },
    rejected: { label: "Rejeitado", variant: "destructive" },
    fulfilled: { label: "Entregue", variant: "outline" },
    canceled: { label: "Cancelado", variant: "destructive" },
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Meus Resgates</h2>
        <p className="text-muted-foreground">Acompanhe o status dos seus resgates</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : redemptions && redemptions.length > 0 ? (
        <div className="space-y-4">
          {redemptions.map((redemption) => (
            <Card key={redemption.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      Resgate #{redemption.id.slice(0, 8)}
                    </CardTitle>
                    <CardDescription>
                      {format(new Date(redemption.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                    </CardDescription>
                  </div>
                  <Badge variant={statusLabels[redemption.status]?.variant || "default"}>
                    {statusLabels[redemption.status]?.label || redemption.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Itens:</h4>
                    <div className="space-y-2">
                      {redemption.redemption_items.map((item: any) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span>
                            {item.qty}x {item.product?.name || "Produto"}
                          </span>
                          <span className="text-muted-foreground">
                            {Number(item.subtotal_points).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                            })} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-medium">Total</span>
                    <span className="font-bold text-primary">
                      {Number(redemption.total_points).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })} pts
                    </span>
                  </div>
                  {redemption.shipping_info && (
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium">Entrega:</span>{" "}
                      {(redemption.shipping_info as any).address}
                    </div>
                  )}
                  {redemption.pickup_store && (
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium">Retirada:</span> {redemption.pickup_store}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Nenhum resgate realizado ainda</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PortalResgates;
