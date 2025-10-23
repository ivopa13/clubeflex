import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const AdminFaturas = () => {
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["admin-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          customer:customers(name),
          specifier:specifiers(name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const statusMap = {
    created: { label: "Criada", variant: "secondary" as const, className: "" },
    partially_paid: { label: "Parcial", variant: "default" as const, className: "" },
    paid: { label: "Paga", variant: "default" as const, className: "bg-green-500 text-white hover:bg-green-600" },
    canceled: { label: "Cancelada", variant: "destructive" as const, className: "" },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Faturas</h1>

      <Card>
        <CardHeader>
          <CardTitle>Todas as Faturas</CardTitle>
          <CardDescription>Visualização de todas as faturas do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Externo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Especificador</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pendente (C)</TableHead>
                  <TableHead>Liberado (C)</TableHead>
                  <TableHead>Pendente (E)</TableHead>
                  <TableHead>Liberado (E)</TableHead>
                  <TableHead>Total Liberado</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices?.map((invoice: any) => {
                  const status = statusMap[invoice.status as keyof typeof statusMap];
                  
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-sm">{invoice.invoice_id_ext}</TableCell>
                      <TableCell className="font-medium">{invoice.customer?.name || "N/A"}</TableCell>
                      <TableCell>{invoice.specifier?.name || "-"}</TableCell>
                      <TableCell>R$ {Number(invoice.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-pending">
                        {Number(invoice.pending_points_customer).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} pontos
                      </TableCell>
                      <TableCell className="text-redeemable">
                        {Number(invoice.released_points_customer).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} pontos
                      </TableCell>
                      <TableCell className="text-pending">
                        {Number(invoice.pending_points_specifier).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} pontos
                      </TableCell>
                      <TableCell className="text-redeemable">
                        {Number(invoice.released_points_specifier).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} pontos
                      </TableCell>
                      <TableCell className="font-bold text-redeemable">
                        {(Number(invoice.released_points_customer) + Number(invoice.released_points_specifier)).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} pontos
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className={status.className}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.created_at), "dd/MM/yy", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminFaturas;
