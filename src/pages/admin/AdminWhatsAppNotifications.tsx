import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, CheckCircle, XCircle, Clock, Search, RefreshCw, User, Briefcase } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useMemo } from "react";

interface WhatsAppNotification {
  id: string;
  recipient_type: string;
  recipient_id: string | null;
  recipient_name: string;
  recipient_phone: string;
  template_name: string;
  invoice_id: string | null;
  invoice_id_ext: string | null;
  total_amount: number | null;
  points: number | null;
  status: string;
  whatsapp_message_id: string | null;
  error_message: string | null;
  created_at: string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'sent':
      return { label: 'Enviado', variant: 'default' as const, icon: CheckCircle };
    case 'delivered':
      return { label: 'Entregue', variant: 'secondary' as const, icon: CheckCircle };
    case 'failed':
      return { label: 'Falhou', variant: 'destructive' as const, icon: XCircle };
    default:
      return { label: status, variant: 'outline' as const, icon: Clock };
  }
};

const getRecipientIcon = (type: string) => {
  return type === 'customer' ? User : Briefcase;
};

export default function AdminWhatsAppNotifications() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: notifications, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      return data as WhatsAppNotification[];
    },
  });

  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];
    if (!searchTerm) return notifications;

    const term = searchTerm.toLowerCase();
    return notifications.filter(
      (n) =>
        n.recipient_name.toLowerCase().includes(term) ||
        n.recipient_phone.includes(term) ||
        n.invoice_id_ext?.toLowerCase().includes(term) ||
        n.template_name.toLowerCase().includes(term)
    );
  }, [notifications, searchTerm]);

  const stats = useMemo(() => {
    if (!notifications) return { total: 0, sent: 0, failed: 0, customers: 0, specifiers: 0 };
    return {
      total: notifications.length,
      sent: notifications.filter((n) => n.status === 'sent' || n.status === 'delivered').length,
      failed: notifications.filter((n) => n.status === 'failed').length,
      customers: notifications.filter((n) => n.recipient_type === 'customer').length,
      specifiers: notifications.filter((n) => n.recipient_type === 'specifier').length,
    };
  }, [notifications]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Notificações WhatsApp</h1>
        <p className="text-muted-foreground">Histórico de mensagens enviadas via WhatsApp Cloud API</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enviados</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sucesso</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Falhas</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.customers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Especificadores</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.specifiers}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Histórico de Notificações</CardTitle>
              <CardDescription>Últimas 500 notificações enviadas</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, telefone, fatura..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Fatura</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pontos</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotifications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? "Nenhuma notificação encontrada" : "Nenhuma notificação enviada ainda"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredNotifications.map((notification) => {
                    const statusInfo = getStatusBadge(notification.status);
                    const RecipientIcon = getRecipientIcon(notification.recipient_type);
                    
                    return (
                      <TableRow key={notification.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(notification.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <RecipientIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="capitalize">
                              {notification.recipient_type === 'customer' ? 'Cliente' : 'Especificador'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate" title={notification.recipient_name}>
                          {notification.recipient_name}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {notification.recipient_phone}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {notification.template_name}
                          </code>
                        </TableCell>
                        <TableCell>
                          {notification.invoice_id_ext || '-'}
                        </TableCell>
                        <TableCell>
                          {notification.total_amount
                            ? notification.total_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {notification.points ? notification.points.toLocaleString('pt-BR') : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={statusInfo.variant}
                            className="flex items-center gap-1 w-fit"
                            title={notification.error_message || undefined}
                          >
                            <statusInfo.icon className="h-3 w-3" />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}