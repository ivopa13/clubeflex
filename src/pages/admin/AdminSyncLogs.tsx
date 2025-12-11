import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Eye, FileText, DollarSign, CalendarIcon, RefreshCw } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useState } from "react";
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
  updated_at: string;
  payload: any;
  error_message: string | null;
  execution_id: string | null;
}

interface IntegratorExecution {
  id: string;
  execution_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  total_events: number;
  success_count: number;
  error_count: number;
  invoice_count: number;
  payment_count: number;
  logs?: SyncLog[];
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

  // Fetch executions
  const { data: executions, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["integrator-executions", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      // Fetch executions
      const { data: executionsData, error: execError } = await supabase
        .from("integrator_executions")
        .select("*")
        .gte("started_at", dateRange.from.toISOString())
        .lte("started_at", dateRange.to.toISOString())
        .order("started_at", { ascending: false });

      if (execError) throw execError;

      // Fetch logs for each execution
      const executionIds = executionsData?.map(e => e.execution_id) || [];
      
      if (executionIds.length === 0) {
        return [] as IntegratorExecution[];
      }

      const { data: logsData, error: logsError } = await supabase
        .from("sync_logs")
        .select("*")
        .in("execution_id", executionIds)
        .order("created_at", { ascending: false });

      if (logsError) throw logsError;

      // Map logs to executions
      const executionsWithLogs: IntegratorExecution[] = (executionsData || []).map(exec => ({
        ...exec,
        logs: (logsData || []).filter(log => log.execution_id === exec.execution_id)
      }));

      return executionsWithLogs;
    },
    staleTime: 0,
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

  const executionStatusMap = {
    running: { label: "Em execução", variant: "secondary" as const, className: "bg-blue-500 hover:bg-blue-600" },
    completed: { label: "Concluído", variant: "default" as const, className: "bg-green-500 hover:bg-green-600" },
    failed: { label: "Falhou", variant: "destructive" as const, className: "" },
  };

  const eventTypeMap = {
    fatura: { label: "Fatura", icon: FileText },
    pagamento: { label: "Pagamento", icon: DollarSign },
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
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} />
            Atualizar
          </Button>
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
            {executions && executions.length > 0 
              ? `${executions.length} execuções encontradas`
              : "Nenhuma execução registrada no período"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!executions || executions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhuma execução do integrador encontrada no período selecionado.</p>
              <p className="text-sm mt-2">O integrador C# precisa ser atualizado para registrar execuções.</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-4">
              {executions.map((execution, index) => {
                const hasErrors = execution.error_count > 0;
                const execStatus = executionStatusMap[execution.status as keyof typeof executionStatusMap] || executionStatusMap.completed;

                return (
                  <AccordionItem 
                    key={execution.id} 
                    value={`execution-${index}`}
                    className="border rounded-lg px-4 bg-card"
                  >
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-4">
                          <div className="text-left">
                            <div className="font-semibold text-base">
                              {format(new Date(execution.started_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {execution.invoice_count > 0 && (
                                <span className="inline-flex items-center gap-1 mr-3">
                                  <FileText className="h-3 w-3" />
                                  {execution.invoice_count} {execution.invoice_count === 1 ? 'fatura' : 'faturas'}
                                </span>
                              )}
                              {execution.payment_count > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  {execution.payment_count} {execution.payment_count === 1 ? 'pagamento' : 'pagamentos'}
                                </span>
                              )}
                              {execution.total_events === 0 && (
                                <span className="text-muted-foreground">Sem eventos</span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Badge variant={execStatus.variant} className={execStatus.className}>
                            {execStatus.label}
                          </Badge>
                          {execution.success_count > 0 && (
                            <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                              {execution.success_count} {execution.success_count === 1 ? 'sucesso' : 'sucessos'}
                            </Badge>
                          )}
                          {hasErrors && (
                            <Badge variant="destructive">
                              {execution.error_count} {execution.error_count === 1 ? 'erro' : 'erros'}
                            </Badge>
                          )}
                          <Badge variant="outline" className="ml-2">
                            {execution.total_events} {execution.total_events === 1 ? 'evento' : 'eventos'}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    
                    <AccordionContent className="pb-4 pt-2">
                      {execution.logs && execution.logs.length > 0 ? (
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
                                      <Badge variant={status?.variant || "secondary"} className={status?.className || ""}>
                                        {status?.label || log.status}
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
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          <p>Nenhum log vinculado a esta execução.</p>
                        </div>
                      )}
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

export default AdminSyncLogs;
