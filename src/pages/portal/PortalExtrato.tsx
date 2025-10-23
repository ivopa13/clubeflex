import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getUserActorInfo } from "@/lib/userRole";

const PortalExtrato = () => {
  const { data: entries, isLoading } = useQuery({
    queryKey: ["portal-ledger"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { actorType, actorId } = await getUserActorInfo();
      if (!actorType || !actorId) throw new Error("Actor not found");

      const actorIdColumn = actorType === "customer" ? "actor_id_customer" : "actor_id_specifier";
      const { data, error } = await supabase
        .from("points_ledger")
        .select(`
          *,
          invoice:invoices(
            invoice_id_ext,
            customer:customers(name)
          )
        `)
        .eq("actor_type", actorType)
        .eq(actorIdColumn, actorId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const typeLabels: Record<string, string> = {
    pending_add: "Pontos Adicionados",
    pending_sub: "Pontos Pendentes Liberados",
    released_add: "Pontos Liberados",
    released_sub: "Pontos Ajustados",
    redeem: "Resgate",
    refund: "Reembolso",
  };

  const getDisplayReference = (entry: any) => {
    if (entry.invoice && entry.invoice.invoice_id_ext) {
      const firstName = entry.invoice.customer?.name?.split(' ')[0] || '';
      return firstName ? `${entry.invoice.invoice_id_ext} - ${firstName}` : entry.invoice.invoice_id_ext;
    }
    return entry.ref || "-";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Extrato de Pontos</h2>
        <p className="text-muted-foreground">Histórico completo de movimentações</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todas as Transações</CardTitle>
          <CardDescription>Movimentações de pontos em ordem cronológica</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : entries && entries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead className="text-right">Pontos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>{typeLabels[entry.type] || entry.type}</TableCell>
                    <TableCell className="text-muted-foreground">{getDisplayReference(entry)}</TableCell>
                    <TableCell className={`text-right font-medium ${Number(entry.points) >= 0 ? "text-accent" : "text-destructive"}`}>
                      {Number(entry.points) >= 0 ? "+" : ""}
                      {Number(entry.points).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nenhuma movimentação registrada</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalExtrato;
