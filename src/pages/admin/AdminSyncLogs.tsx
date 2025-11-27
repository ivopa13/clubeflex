import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInMinutes, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Eye, FileText, DollarSign, CalendarIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useState, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SyncLog {
  id: string;
  event_id: string;
  event_type: string;
  status: string;
  attempts: number;
  created_at: string;
  payload: any;
  error_message: string | null;
}

interface SyncExecution {
  timestamp: Date;
  logs: SyncLog[];
  totalEvents: number;
  invoiceCount: number;
  paymentCount: number;
  successCount: number;
  errorCount: number;
}

type DateRange = {
  from: Date;
  to: Date;
};

type PresetFilter = "today" | "yesterday" | "this_week" | "custom";

const AdminSyncLogs = () => {
  const [selectedLog, setSelectedLog] = useState<SyncLog | null>(null);
  const today = new Date();

  const [presetFilter, setPresetFilter] = useState<PresetFilter>("today");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfDay(today),
    to: endOfDay(today),
  });
  const [tempDateRange, setTempDateRange] = useState<DateRange>(dateRange);

  const handlePresetChange = (preset: PresetFilter) => {
    setPresetFilter(preset);
    
    let newRange: DateRange;
    
    switch (preset) {
      case "today":
        newRange = { from: startOfDay(today), to: endOfDay(today) };
        break;
      case "yesterday":
        const yesterday = subDays(today, 1);
        newRange = { from: startOfDay(yesterday), to: endOfDay(yesterday) };
        break;
      case "this_week":
        newRange = { from: startOfWeek(today, { weekStartsOn: 0 }), to: endOfWeek(today, { weekStartsOn: 0 }) };
        break;
      default:
        return;
    }
    
    setDateRange(newRange);
    setTempDateRange(newRange);
  };

  const handleCustomDateApply = () => {
    setDateRange({
      from: startOfDay(tempDateRange.from),
      to: endOfDay(tempDateRange.to),
    });
    setPresetFilter("custom");
  };

  const { data: logs, isLoading } = useQuery({
    queryKey: ["sync-logs", dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as SyncLog[];
    },
  });

  // Group logs by execution (same minute)
  const executions: SyncExecution[] = useMemo(() => {
    return logs ? groupLogsByExecution(logs) : [];
  }, [logs]);

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
    invoice_created: { label: "Fatura", icon: FileText },
    payment_confirmed: { label: "Pagamento", icon: DollarSign },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Logs de Integração</h1>
          <p className="text-muted-foreground mt-2">Histórico de execuções do integrador Windows</p>
        </div>

        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={presetFilter === "today" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetChange("today")}
          >
            Hoje
          </Button>
          <Button
            variant={presetFilter === "yesterday" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetChange("yesterday")}
          >
            Ontem
          </Button>
          <Button
            variant={presetFilter === "this_week" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetChange("this_week")}
          >
            Esta Semana
          </Button>
          
          {/* Custom Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={presetFilter === "custom" ? "default" : "outline"}
                size="sm"
                className="min-w-[180px] justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {presetFilter === "custom" ? (
                  <>
                    {format(dateRange.from, "dd/MM/yy", { locale: ptBR })} - {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
                  </>
                ) : (
                  "Personalizado"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="end">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium mb-2">De:</p>
                    <Calendar
                      mode="single"
                      selected={tempDateRange.from}
                      onSelect={(date) => date && setTempDateRange(prev => ({ ...prev, from: date }))}
                      locale={ptBR}
                      className={cn("p-3 pointer-events-auto border rounded-md")}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Até:</p>
                    <Calendar
                      mode="single"
                      selected={tempDateRange.to}
                      onSelect={(date) => date && setTempDateRange(prev => ({ ...prev, to: date }))}
                      locale={ptBR}
                      className={cn("p-3 pointer-events-auto border rounded-md")}
                    />
                  </div>
                </div>
                <Button onClick={handleCustomDateApply} className="w-full">
                  Aplicar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Period Display */}
      <p className="text-sm text-muted-foreground">
        Exibindo logs de {format(dateRange.from, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} até {format(dateRange.to, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Execuções do Integrador</CardTitle>
          <CardDescription>
            {executions.length > 0 
              ? `${executions.length} execuções encontradas`
              : "Nenhuma execução registrada no período"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!executions || executions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum log de sincronização encontrado no período selecionado.</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-4">
              {executions.map((execution, index) => {
                const hasErrors = execution.errorCount > 0;
                const statusVariant = hasErrors ? "destructive" : "default";
                const statusClassName = hasErrors ? "" : "bg-green-500 hover:bg-green-600";

                return (
                  <AccordionItem 
                    key={`execution-${execution.timestamp.getTime()}`} 
                    value={`execution-${index}`}
                    className="border rounded-lg px-4 bg-card"
                  >
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-4">
                          <div className="text-left">
                            <div className="font-semibold text-base">
                              {format(execution.timestamp, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {execution.invoiceCount > 0 && (
                                <span className="inline-flex items-center gap-1 mr-3">
                                  <FileText className="h-3 w-3" />
                                  {execution.invoiceCount} {execution.invoiceCount === 1 ? 'fatura' : 'faturas'}
                                </span>
                              )}
                              {execution.paymentCount > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  {execution.paymentCount} {execution.paymentCount === 1 ? 'pagamento' : 'pagamentos'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Badge variant={statusVariant} className={statusClassName}>
                            {execution.successCount} {execution.successCount === 1 ? 'sucesso' : 'sucessos'}
                          </Badge>
                          {hasErrors && (
                            <Badge variant="destructive">
                              {execution.errorCount} {execution.errorCount === 1 ? 'erro' : 'erros'}
                            </Badge>
                          )}
                          <Badge variant="outline" className="ml-2">
                            {execution.totalEvents} {execution.totalEvents === 1 ? 'evento' : 'eventos'}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    
                    <AccordionContent className="pb-4 pt-2">
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[140px]">Event ID</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="w-[100px]">Tentativas</TableHead>
                              <TableHead>Horário</TableHead>
                              <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {execution.logs.map((log) => {
                              const status = statusMap[log.status as keyof typeof statusMap];
                              const eventType = eventTypeMap[log.event_type as keyof typeof eventTypeMap];
                              const EventIcon = eventType?.icon;

                              return (
                                <TableRow key={log.id}>
                                  <TableCell className="font-mono text-xs">{log.event_id}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {EventIcon && <EventIcon className="h-4 w-4 text-muted-foreground" />}
                                      <span className="font-medium">
                                        {eventType?.label || log.event_type}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={status.variant} className={status.className}>
                                      {status.label}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{log.attempts}</TableCell>
                                  <TableCell className="text-sm">
                                    {format(new Date(log.created_at), "HH:mm:ss", { locale: ptBR })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setSelectedLog(log)}
                                    >
                                      <Eye className="h-4 w-4 mr-2" />
                                      Ver JSON
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Detalhes do Evento</DialogTitle>
            <DialogDescription>Informações completas do log de sincronização</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
            {selectedLog && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Informações Básicas</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Event ID:</strong> {selectedLog.event_id}</p>
                    <p><strong>Tipo:</strong> {selectedLog.event_type}</p>
                    <p><strong>Status:</strong> {selectedLog.status}</p>
                    <p><strong>Tentativas:</strong> {selectedLog.attempts}</p>
                    <p><strong>Data/Hora:</strong> {format(new Date(selectedLog.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
                  </div>
                </div>
                {selectedLog.error_message && (
                  <div>
                    <h4 className="font-semibold mb-2 text-destructive">Mensagem de Erro</h4>
                    <pre className="bg-destructive/10 p-3 rounded text-xs overflow-auto">{selectedLog.error_message}</pre>
                  </div>
                )}
                <div>
                  <h4 className="font-semibold mb-2">Payload</h4>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto">{JSON.stringify(selectedLog.payload, null, 2)}</pre>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function groupLogsByExecution(logs: SyncLog[]): SyncExecution[] {
  if (!logs || logs.length === 0) return [];

  // Sort logs by creation date (oldest first)
  const sortedLogs = [...logs].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const executions: SyncExecution[] = [];
  let currentExecution: SyncLog[] = [sortedLogs[0]];
  let lastTimestamp = new Date(sortedLogs[0].created_at);

  // Group logs within 5 minutes of each other into same execution
  for (let i = 1; i < sortedLogs.length; i++) {
    const currentTimestamp = new Date(sortedLogs[i].created_at);
    const minutesDiff = differenceInMinutes(currentTimestamp, lastTimestamp);

    if (minutesDiff <= 5) {
      // Same execution - within 5 minutes
      currentExecution.push(sortedLogs[i]);
    } else {
      // New execution - more than 5 minutes gap
      // Save current execution
      const firstLog = currentExecution[0];
      const timestamp = new Date(firstLog.created_at);
      const invoiceCount = currentExecution.filter(l => l.event_type === 'invoice_created').length;
      const paymentCount = currentExecution.filter(l => l.event_type === 'payment_confirmed').length;
      const successCount = currentExecution.filter(l => l.status === 'success').length;
      const errorCount = currentExecution.filter(l => l.status === 'error').length;

      executions.push({
        timestamp,
        logs: currentExecution.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        totalEvents: currentExecution.length,
        invoiceCount,
        paymentCount,
        successCount,
        errorCount,
      });

      // Start new execution
      currentExecution = [sortedLogs[i]];
    }
    
    lastTimestamp = currentTimestamp;
  }

  // Don't forget the last execution
  if (currentExecution.length > 0) {
    const firstLog = currentExecution[0];
    const timestamp = new Date(firstLog.created_at);
    const invoiceCount = currentExecution.filter(l => l.event_type === 'invoice_created').length;
    const paymentCount = currentExecution.filter(l => l.event_type === 'payment_confirmed').length;
    const successCount = currentExecution.filter(l => l.status === 'success').length;
    const errorCount = currentExecution.filter(l => l.status === 'error').length;

    executions.push({
      timestamp,
      logs: currentExecution.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      totalEvents: currentExecution.length,
      invoiceCount,
      paymentCount,
      successCount,
      errorCount,
    });
  }

  // Return executions sorted by most recent first
  return executions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export default AdminSyncLogs;
