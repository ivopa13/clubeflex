import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileCheck, Receipt, Calendar, DollarSign, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Payment {
  id: string;
  payment_event_id: string;
  paid_amount: number;
  paid_at: string;
  payment_type: string;
  created_at: string;
  invoice: {
    invoice_id_ext: string;
    total_amount: number;
    customer: {
      name: string;
    };
  } | null;
}

const AdminChequesEBoletos = () => {
  const { data: payments, isLoading } = useQuery({
    queryKey: ["cheques-boletos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          id,
          payment_event_id,
          paid_amount,
          paid_at,
          payment_type,
          created_at,
          invoice:invoices (
            invoice_id_ext,
            total_amount,
            customer:customers (
              name
            )
          )
        `)
        .in("payment_type", ["check", "boleto"])
        .order("paid_at", { ascending: false });

      if (error) throw error;
      return data as Payment[];
    },
  });

  const cheques = payments?.filter(p => p.payment_type === "check") || [];
  const boletos = payments?.filter(p => p.payment_type === "boleto") || [];

  const totalCheques = cheques.reduce((sum, p) => sum + Number(p.paid_amount), 0);
  const totalBoletos = boletos.reduce((sum, p) => sum + Number(p.paid_amount), 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Cheques e Boletos</h1>
          <p className="text-muted-foreground">Controle de pagamentos via cheque e boleto</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cheques Recebidos</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cheques.length}</div>
            <p className="text-xs text-muted-foreground">pagamentos via cheque</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total em Cheques</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalCheques)}</div>
            <p className="text-xs text-muted-foreground">valor total recebido</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Boletos Recebidos</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{boletos.length}</div>
            <p className="text-xs text-muted-foreground">pagamentos via boleto</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total em Boletos</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(totalBoletos)}</div>
            <p className="text-xs text-muted-foreground">valor total recebido</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Card */}
      <Card className={payments && payments.length > 0 ? "border-green-500 bg-green-50" : "border-yellow-500 bg-yellow-50"}>
        <CardContent className="flex items-center gap-3 py-4">
          {payments && payments.length > 0 ? (
            <>
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-800">Sincronização OK</p>
                <p className="text-sm text-green-700">
                  {payments.length} pagamentos de cheques/boletos sincronizados com sucesso
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="h-6 w-6 text-yellow-600" />
              <div>
                <p className="font-semibold text-yellow-800">Nenhum registro encontrado</p>
                <p className="text-sm text-yellow-700">
                  Ainda não há pagamentos de cheques ou boletos sincronizados
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cheques Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Cheques ({cheques.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cheques.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum cheque sincronizado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Fatura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data Pagamento</TableHead>
                  <TableHead>Sincronizado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cheques.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs">{payment.payment_event_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{payment.invoice?.invoice_id_ext || "-"}</Badge>
                    </TableCell>
                    <TableCell>{payment.invoice?.customer?.name || "-"}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(payment.paid_amount)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(payment.paid_at)}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(payment.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Boletos Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Boletos ({boletos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {boletos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum boleto sincronizado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Fatura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data Pagamento</TableHead>
                  <TableHead>Sincronizado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boletos.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs">{payment.payment_event_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{payment.invoice?.invoice_id_ext || "-"}</Badge>
                    </TableCell>
                    <TableCell>{payment.invoice?.customer?.name || "-"}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(payment.paid_amount)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(payment.paid_at)}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(payment.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminChequesEBoletos;
