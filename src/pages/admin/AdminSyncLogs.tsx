import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";

const AdminSyncLogs = () => {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["sync-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Logs de Integração</h1>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusMap = {
    pending: { label: "Pendente", variant: "secondary" as const, className: "" },
    success: { label: "Sucesso", variant: "default" as const, className: "bg-green-500 hover:bg-green-600" },
    error: { label: "Erro", variant: "destructive" as const, className: "" },
  };

  const eventTypeMap = {
    invoice_created: { label: "Fatura Criada", color: "text-blue-600" },
    payment_confirmed: { label: "Pagamento Confirmado", color: "text-green-600" },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Logs de Integração</h1>
        <p className="text-muted-foreground mt-2">Visualize os dados recebidos do integrador Windows</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Sincronização</CardTitle>
          <CardDescription>Últimos 100 registros sincronizados</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento ID</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.map((log: any) => {
                const status = statusMap[log.status as keyof typeof statusMap];
                const eventType = eventTypeMap[log.event_type as keyof typeof eventTypeMap];

                return (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.event_id}</TableCell>
                    <TableCell>
                      <span className={`font-medium ${eventType?.color || ""}`}>
                        {eventType?.label || log.event_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant} className={status.className}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.attempts}</TableCell>
                    <TableCell>
                      {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-2" />
                            Ver JSON
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>Detalhes do Evento</DialogTitle>
                            <DialogDescription>
                              {eventType?.label || log.event_type} - {log.event_id}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-semibold mb-2">Status: {status.label}</h4>
                              {log.error_message && (
                                <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                                  <strong>Erro:</strong> {log.error_message}
                                </div>
                              )}
                            </div>
                            <div>
                              <h4 className="font-semibold mb-2">Payload Recebido:</h4>
                              <ScrollArea className="h-96 w-full rounded-md border">
                                <pre className="p-4 text-xs">
                                  {JSON.stringify(log.payload, null, 2)}
                                </pre>
                              </ScrollArea>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <p>Criado em: {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                              <p>Atualizado em: {format(new Date(log.updated_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                              <p>Tentativas: {log.attempts}</p>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!logs?.length && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum log de sincronização encontrado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSyncLogs;
