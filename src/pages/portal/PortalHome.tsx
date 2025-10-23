import { usePortalBalance } from "@/hooks/usePortalBalance";
import { PointsCard } from "@/components/PointsCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PortalHome = () => {
  const { data: balance, isLoading } = usePortalBalance();

  // Get recent ledger entries
  const { data: recentEntries } = useQuery({
    queryKey: ["portal-recent-ledger"],
    queryFn: async () => {
      if (!balance?.actorId || !balance?.actorType) return [];

      const actorIdColumn = balance.actorType === "customer" ? "actor_id_customer" : "actor_id_specifier";
      const { data, error } = await supabase
        .from("points_ledger")
        .select("*")
        .eq("actor_type", balance.actorType)
        .eq(actorIdColumn, balance.actorId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!balance?.actorId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    pending_add: "Pontos Pendentes Adicionados",
    pending_sub: "Pontos Pendentes Liberados",
    released_add: "Pontos Liberados",
    released_sub: "Pontos Ajustados",
    redeem: "Resgate",
    refund: "Reembolso",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Bem-vindo!</h2>
        <p className="text-muted-foreground">Acompanhe seus pontos e resgates</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <PointsCard
          type="pending"
          value={balance?.pending || 0}
          title="Pontos Pendentes"
          description="Aguardando confirmação de pagamento"
        />
        <PointsCard
          type="redeemable"
          value={balance?.redeemable || 0}
          title="Pontos Resgatáveis"
          description="Disponíveis para resgate"
        />
        <PointsCard
          type="redeemed"
          value={balance?.redeemed || 0}
          title="Pontos Resgatados"
          description="Já utilizados em resgates"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas Movimentações</CardTitle>
          <CardDescription>Histórico recente de pontos</CardDescription>
        </CardHeader>
        <CardContent>
          {recentEntries && recentEntries.length > 0 ? (
            <div className="space-y-4">
              {recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between border-b pb-4 last:border-b-0"
                >
                  <div>
                    <p className="font-medium">{typeLabels[entry.type] || entry.type}</p>
                    <p className="text-sm text-muted-foreground">{entry.ref}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <p className={`font-bold ${Number(entry.points) >= 0 ? "text-accent" : "text-destructive"}`}>
                    {Number(entry.points) >= 0 ? "+" : ""}
                    {Number(entry.points).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    pts
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nenhuma movimentação ainda</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalHome;
