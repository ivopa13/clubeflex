import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { DollarSign, FileText, Calendar } from "lucide-react";

interface Payment {
  id: string;
  payment_event_id: string;
  paid_amount: number;
  paid_at: string;
  created_at: string;
  payment_type: string;
  invoice: {
    invoice_id_ext: string;
    customer: {
      name: string;
    };
  };
}

const getPaymentTypeBadge = (type: string) => {
  const types: Record<string, { label: string; color: string }> = {
    cash: { label: "Dinheiro", color: "#10b981" },
    check: { label: "Cheque", color: "#ff914d" },
    card: { label: "Cartão", color: "#8b5cf6" },
    credit_card: { label: "Cartão de Crédito", color: "#8b5cf6" },
    debit_card: { label: "Cartão de Débito", color: "#6366f1" },
    credit: { label: "A Prazo", color: "#18375d" },
    pix: { label: "PIX", color: "#00b4a0" },
    boleto: { label: "Boleto Bancário", color: "#f59e0b" },
    transfer: { label: "Depósito/Transferência", color: "#3b82f6" },
    installment: { label: "Carnê", color: "#ec4899" },
    credit_account: { label: "Crédito em Conta", color: "#14b8a6" },
    exchange: { label: "Permuta", color: "#a855f7" },
    unknown: { label: "Não identificado", color: "#6b7280" }
  };
  
  return types[type as keyof typeof types] || types.unknown;
};

const AdminPagamentos = () => {
  const { data: payments, isLoading } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          *,
          invoice:invoices(
            invoice_id_ext,
            customer:customers(name)
          )
        `)
        .order("paid_at", { ascending: false });

      if (error) throw error;
      return data as Payment[];
    },
  });

  const totalPaid = payments?.reduce((sum, p) => sum + Number(p.paid_amount), 0) || 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Pagamentos</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Pagamentos</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card style={{ backgroundColor: "#ff914d", color: "white" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Pagamentos</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payments?.length || 0}</div>
          </CardContent>
        </Card>

        <Card style={{ backgroundColor: "#18375d", color: "white" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Valor Total Pago</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(totalPaid)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Último Pagamento</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {payments?.[0]
                ? format(new Date(payments[0].paid_at), "dd/MM/yyyy")
                : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID do Evento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fatura</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor Pago</TableHead>
                <TableHead>Data do Pagamento</TableHead>
                <TableHead>Registrado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments?.map((payment) => {
                const typeBadge = getPaymentTypeBadge(payment.payment_type);
                
                return (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {payment.payment_event_id}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        style={{ 
                          backgroundColor: typeBadge.color, 
                          color: 'white',
                          borderColor: typeBadge.color
                        }}
                      >
                        {typeBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {payment.invoice?.invoice_id_ext || "-"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {payment.invoice?.customer?.name || "N/A"}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold" style={{ color: "#ff914d" }}>
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(Number(payment.paid_amount))}
                      </span>
                    </TableCell>
                    <TableCell>
                      {format(new Date(payment.paid_at), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(payment.created_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!payments?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum pagamento registrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPagamentos;
