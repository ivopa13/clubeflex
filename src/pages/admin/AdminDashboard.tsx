import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAdminStats } from "@/hooks/useAdminStats";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, Package } from "lucide-react";

const AdminDashboard = () => {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
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
      </div>
    );
  }

  const statusMap = {
    requested: { label: "Solicitado", variant: "secondary" as const },
    approved: { label: "Aprovado", variant: "default" as const },
    rejected: { label: "Rejeitado", variant: "destructive" as const },
    fulfilled: { label: "Entregue", variant: "default" as const },
    canceled: { label: "Cancelado", variant: "outline" as const },
  };

  const invoiceStatusMap = {
    created: { label: "Criada", variant: "secondary" as const, className: "" },
    partially_paid: { label: "Parcial", variant: "default" as const, className: "" },
    paid: { label: "Paga", variant: "default" as const, className: "bg-green-500 text-white hover:bg-green-600" },
    canceled: { label: "Cancelada", variant: "destructive" as const, className: "" },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pontos Pendentes</CardTitle>
            <TrendingUp className="h-4 w-4 text-pending" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pending">
              {stats?.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pontos
            </div>
            <p className="text-xs text-muted-foreground">Total aguardando liberação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pontos Resgatáveis</CardTitle>
            <Package className="h-4 w-4 text-redeemable" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-redeemable">
              {stats?.totalRedeemable.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pontos
            </div>
            <p className="text-xs text-muted-foreground">Disponíveis para resgate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resgatados Este Mês</CardTitle>
            <TrendingDown className="h-4 w-4 text-redeemed" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-redeemed">
              {stats?.totalRedeemedThisMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pontos
            </div>
            <p className="text-xs text-muted-foreground">Total de resgates do mês</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimos Resgates</CardTitle>
            <CardDescription>5 resgates mais recentes</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Pontos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats?.recentRedemptions.map((redemption: any) => {
                  const userName = redemption.actor_type === "customer"
                    ? redemption.actor_id_customer?.name
                    : redemption.actor_id_specifier?.name;
                  const status = statusMap[redemption.status as keyof typeof statusMap];
                  
                  return (
                    <TableRow key={redemption.id}>
                      <TableCell className="font-medium">{userName || "N/A"}</TableCell>
                      <TableCell>{Number(redemption.total_points).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pontos</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(redemption.created_at), "dd/MM/yy", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimas Faturas</CardTitle>
            <CardDescription>5 faturas mais recentes</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats?.recentInvoices.map((invoice: any) => {
                  const status = invoiceStatusMap[invoice.status as keyof typeof invoiceStatusMap];
                  
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.customer?.name || "N/A"}</TableCell>
                      <TableCell>R$ {Number(invoice.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
