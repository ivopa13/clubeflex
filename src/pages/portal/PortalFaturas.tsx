import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getUserActorInfo } from "@/lib/userRole";

const PortalFaturas = () => {
  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ["portal-invoices"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { actorType, actorId } = await getUserActorInfo();
      if (!actorType || !actorId) throw new Error("Actor not found");

      const filterColumn = actorType === "customer" ? "customer_id" : "specifier_id";
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq(filterColumn, actorId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return { invoices: data, actorType };
    },
  });

  const invoices = invoicesData?.invoices;
  const actorType = invoicesData?.actorType;

  const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    created: { label: "Criada", variant: "secondary" },
    partially_paid: { label: "Parcialmente Paga", variant: "default" },
    paid: { label: "Paga", variant: "outline" },
    canceled: { label: "Cancelada", variant: "destructive" },
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Minhas Faturas</h2>
        <p className="text-muted-foreground">Acompanhe suas compras e pontos</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Faturas</CardTitle>
          <CardDescription>Compras realizadas na Flex Materiais</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : invoices && invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Fatura</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Pontos Pendentes</TableHead>
                  <TableHead className="text-right">Pontos Liberados</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoice_id_ext}</TableCell>
                    <TableCell>
                      {format(new Date(invoice.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right">
                      R$ {Number(invoice.total_amount).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="text-right text-[hsl(var(--points-pending))]">
                      {Number(
                        actorType === "customer" 
                          ? invoice.pending_points_customer 
                          : invoice.pending_points_specifier
                      ).toLocaleString("pt-BR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })} pontos
                    </TableCell>
                    <TableCell className="text-right text-[hsl(var(--points-redeemable))]">
                      {Number(
                        actorType === "customer"
                          ? invoice.released_points_customer
                          : invoice.released_points_specifier
                      ).toLocaleString("pt-BR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })} pontos
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusLabels[invoice.status]?.variant || "default"}>
                        {statusLabels[invoice.status]?.label || invoice.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nenhuma fatura encontrada</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalFaturas;
