import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarIcon,
  DollarSign,
  Receipt,
  TrendingUp,
  CreditCard,
  Banknote,
  Wallet,
  PiggyBank,
  Package,
  Wrench,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Search,
  Settings2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type DateRange = {
  from: Date;
  to: Date;
};

type PresetFilter = "this_month" | "last_month" | "this_year" | "custom";

type InvoiceRow = {
  id: string;
  invoice_id_ext: string;
  total_amount: number;
  movement_type: string | null;
  status: string;
  created_at: string | null;
};

const paymentTypeLabels: Record<string, { label: string; icon: typeof CreditCard }> = {
  "cash": { label: "Dinheiro", icon: Banknote },
  "check": { label: "Cheque", icon: Receipt },
  "card": { label: "Cartão", icon: CreditCard },
  "credit_card": { label: "Cartão de Crédito", icon: CreditCard },
  "debit_card": { label: "Cartão de Débito", icon: CreditCard },
  "credit": { label: "A Prazo", icon: Wallet },
  "pix": { label: "PIX", icon: Wallet },
  "boleto": { label: "Boleto Bancário", icon: Receipt },
  "transfer": { label: "TED/Transferência", icon: PiggyBank },
  "installment": { label: "Carnê", icon: Receipt },
  "voucher": { label: "Vale", icon: Receipt },
  "promissory": { label: "Promissória", icon: Receipt },
  "credit_account": { label: "Crédito em Conta", icon: Wallet },
  "exchange": { label: "Permuta", icon: Receipt },
  "pending": { label: "Aguardando Pagamento", icon: Wallet },
  "unknown": { label: "Outros", icon: Wallet },
};

const AdminVendas = () => {
  const today = new Date();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [presetFilter, setPresetFilter] = useState<PresetFilter>("this_month");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(today),
    to: endOfMonth(today),
  });
  const [tempDateRange, setTempDateRange] = useState<DateRange>(dateRange);

  // Reclassification state
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [reclassifyResult, setReclassifyResult] = useState<{ updated: number } | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  const handlePresetChange = (preset: PresetFilter) => {
    setPresetFilter(preset);
    let newRange: DateRange;
    switch (preset) {
      case "this_month":
        newRange = { from: startOfMonth(today), to: endOfMonth(today) };
        break;
      case "last_month":
        const lastMonth = subMonths(today, 1);
        newRange = { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
        break;
      case "this_year":
        newRange = { from: startOfYear(today), to: endOfYear(today) };
        break;
      default:
        return;
    }
    setDateRange(newRange);
    setTempDateRange(newRange);
  };

  const handleCustomDateApply = () => {
    setDateRange(tempDateRange);
    setPresetFilter("custom");
  };

  // Métricas gerais
  const { data: metricsData, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ["sales-metrics", dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_metrics", {
        from_date: dateRange.from.toISOString(),
        to_date: dateRange.to.toISOString(),
      });
      if (error) throw error;
      return data as {
        total_revenue: number;
        ticket_count: number;
        avg_ticket: number;
        product_revenue: number;
        product_count: number;
        service_revenue: number;
        service_count: number;
      };
    },
  });

  // Breakdown por tipo de pagamento
  const { data: salesByTypeRaw, isLoading: isLoadingByType } = useQuery({
    queryKey: ["sales-by-payment-type", dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_by_payment_type", {
        from_date: dateRange.from.toISOString(),
        to_date: dateRange.to.toISOString(),
      });
      if (error) throw error;
      return (data || {}) as Record<string, { count: number; total: number }>;
    },
  });

  // Preview das faturas com movement_type = 'produto' (potencialmente erradas)
  const {
    data: candidateInvoices,
    isLoading: isLoadingCandidates,
    refetch: refetchCandidates,
  } = useQuery({
    queryKey: ["reclassify-preview"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("reclassify-invoices", {
        body: { mode: "preview" },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setPreviewLoaded(true);
      return data.invoices as InvoiceRow[];
    },
    enabled: false,
  });

  // Mutation para executar a reclassificação
  const reclassifyMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.functions.invoke("reclassify-invoices", {
        body: { mode: "execute", invoice_ids: ids },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data as { updated: number };
    },
    onSuccess: (result) => {
      setReclassifyResult(result);
      setSelectedInvoiceIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["sales-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["sales-by-payment-type"] });
      refetchCandidates();
      toast({
        title: "Reclassificação concluída",
        description: `${result.updated} faturas foram reclassificadas para "serviço" com sucesso.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Erro na reclassificação",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const isLoading = isLoadingMetrics || isLoadingByType;

  const metrics = useMemo(() => {
    const m = metricsData;
    return {
      totalRevenue:   Number(m?.total_revenue ?? 0),
      ticketCount:    Number(m?.ticket_count ?? 0),
      avgTicket:      Number(m?.avg_ticket ?? 0),
      productRevenue: Number(m?.product_revenue ?? 0),
      productCount:   Number(m?.product_count ?? 0),
      serviceRevenue: Number(m?.service_revenue ?? 0),
      serviceCount:   Number(m?.service_count ?? 0),
      salesByType:    (salesByTypeRaw ?? {}) as Record<string, { count: number; total: number }>,
    };
  }, [metricsData, salesByTypeRaw]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const handleToggleAll = (checked: boolean) => {
    if (!candidateInvoices) return;
    if (checked) {
      setSelectedInvoiceIds(new Set(candidateInvoices.map((inv) => inv.id)));
    } else {
      setSelectedInvoiceIds(new Set());
    }
  };

  const handleToggleOne = (id: string, checked: boolean) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allSelected =
    candidateInvoices && candidateInvoices.length > 0 &&
    candidateInvoices.every((inv) => selectedInvoiceIds.has(inv.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Dashboard de Vendas</h1>

        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={presetFilter === "this_month" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("this_month")}>Este Mês</Button>
          <Button variant={presetFilter === "last_month" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("last_month")}>Último Mês</Button>
          <Button variant={presetFilter === "this_year" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("this_year")}>Este Ano</Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant={presetFilter === "custom" ? "default" : "outline"} size="sm" className="min-w-[200px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {presetFilter === "custom" ? (
                  <>{format(dateRange.from, "dd/MM/yy", { locale: ptBR })} - {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}</>
                ) : "Personalizado"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="end">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium mb-2">De:</p>
                    <Calendar mode="single" selected={tempDateRange.from} onSelect={(date) => date && setTempDateRange(prev => ({ ...prev, from: date }))} locale={ptBR} className={cn("p-3 pointer-events-auto border rounded-md")} />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Até:</p>
                    <Calendar mode="single" selected={tempDateRange.to} onSelect={(date) => date && setTempDateRange(prev => ({ ...prev, to: date }))} locale={ptBR} className={cn("p-3 pointer-events-auto border rounded-md")} />
                  </div>
                </div>
                <Button onClick={handleCustomDateApply} className="w-full">Aplicar</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Period Display */}
      <p className="text-sm text-muted-foreground">
        Exibindo dados de {format(dateRange.from, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} até {format(dateRange.to, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
      </p>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">
            <TrendingUp className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="manutencao">
            <Settings2 className="h-4 w-4 mr-2" />
            Manutenção de Dados
          </TabsTrigger>
        </TabsList>

        {/* ===== Dashboard Tab ===== */}
        <TabsContent value="dashboard" className="space-y-6 mt-4">
          {/* Main Metrics */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-32" /> : (
                  <div className="text-2xl font-bold text-primary">{formatCurrency(metrics.totalRevenue)}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Número de Tickets</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-20" /> : (
                  <div className="text-2xl font-bold">{metrics.ticketCount}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-28" /> : (
                  <div className="text-2xl font-bold">{formatCurrency(metrics.avgTicket)}</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Produto vs Serviço */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-l-4 border-l-primary">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vendas de Produtos</CardTitle>
                <Package className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-32" /> : (
                  <>
                    <div className="text-2xl font-bold text-primary">{formatCurrency(metrics.productRevenue)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {metrics.productCount} vendas • {metrics.totalRevenue > 0 ? ((metrics.productRevenue / metrics.totalRevenue) * 100).toFixed(1) : "0"}% do total
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-secondary">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vendas de Serviços</CardTitle>
                <Wrench className="h-4 w-4 text-secondary" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-32" /> : (
                  <>
                    <div className="text-2xl font-bold text-secondary">{formatCurrency(metrics.serviceRevenue)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {metrics.serviceCount} vendas • {metrics.totalRevenue > 0 ? ((metrics.serviceRevenue / metrics.totalRevenue) * 100).toFixed(1) : "0"}% do total
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tipos de Venda */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Tipos de Venda</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : Object.keys(metrics.salesByType).length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhuma venda encontrada no período selecionado</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(metrics.salesByType).map(([type, data]) => {
                    const typeInfo = paymentTypeLabels[type] || paymentTypeLabels["unknown"];
                    const Icon = typeInfo.icon;
                    const percentage = metrics.totalRevenue > 0 ? ((data.total / metrics.totalRevenue) * 100).toFixed(1) : "0";
                    return (
                      <div key={type} className="flex items-center gap-4 p-4 rounded-lg border bg-card">
                        <div className="p-2 rounded-full bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{typeInfo.label}</p>
                          <p className="text-xl font-bold">{formatCurrency(data.total)}</p>
                          <p className="text-xs text-muted-foreground">{data.count} vendas • {percentage}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Manutenção Tab ===== */}
        <TabsContent value="manutencao" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-primary" />
                Reclassificação Histórica de Faturas
              </CardTitle>
              <CardDescription>
                Faturas sincronizadas antes da correção do integrador podem estar classificadas como <strong>produto</strong> quando deveriam ser <strong>serviço</strong> (código 064 — Venda de Serviços). Selecione as faturas a corrigir e confirme a reclassificação.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Esta ação é <strong>irreversível</strong>. Selecione apenas faturas que correspondam a vendas de serviços (código 064 no ERP). Após a reclassificação, os totais do dashboard serão atualizados automaticamente.
                </AlertDescription>
              </Alert>

              {reclassifyResult && (
                <Alert className="border-primary/30 bg-primary/5">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-primary">
                    <strong>{reclassifyResult.updated} faturas</strong> reclassificadas com sucesso para "serviço".
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setPreviewLoaded(false); setSelectedInvoiceIds(new Set()); setReclassifyResult(null); refetchCandidates(); }}
                  disabled={isLoadingCandidates}
                >
                  <Search className="h-4 w-4 mr-2" />
                  {isLoadingCandidates ? "Buscando..." : previewLoaded ? "Recarregar lista" : "Buscar faturas candidatas"}
                </Button>

                {selectedInvoiceIds.size > 0 && (
                  <Button
                    onClick={() => reclassifyMutation.mutate(Array.from(selectedInvoiceIds))}
                    disabled={reclassifyMutation.isPending}
                    className="ml-auto"
                  >
                    <Wrench className="h-4 w-4 mr-2" />
                    {reclassifyMutation.isPending
                      ? "Reclassificando..."
                      : `Reclassificar ${selectedInvoiceIds.size} fatura${selectedInvoiceIds.size > 1 ? "s" : ""} como Serviço`}
                  </Button>
                )}
              </div>

              {isLoadingCandidates && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              )}

              {previewLoaded && candidateInvoices && (
                <>
                  {candidateInvoices.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-primary" />
                      <p>Nenhuma fatura com <code>movement_type = produto</code> encontrada. Dados já estão corretos!</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-4 py-3 flex items-center gap-3 border-b">
                        <Checkbox
                          checked={!!allSelected}
                          onCheckedChange={(v) => handleToggleAll(!!v)}
                          id="select-all"
                        />
                        <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                          Selecionar todas ({candidateInvoices.length} faturas)
                        </label>
                        {selectedInvoiceIds.size > 0 && (
                          <Badge variant="secondary" className="ml-auto">
                            {selectedInvoiceIds.size} selecionada{selectedInvoiceIds.size > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>

                      <div className="divide-y max-h-[400px] overflow-y-auto">
                        {candidateInvoices.map((inv) => (
                          <div key={inv.id} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors", selectedInvoiceIds.has(inv.id) && "bg-primary/5")}>
                            <Checkbox
                              checked={selectedInvoiceIds.has(inv.id)}
                              onCheckedChange={(v) => handleToggleOne(inv.id, !!v)}
                              id={`inv-${inv.id}`}
                            />
                            <label htmlFor={`inv-${inv.id}`} className="flex-1 cursor-pointer">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <span className="text-sm font-medium font-mono">{inv.invoice_id_ext}</span>
                                  <span className="text-xs text-muted-foreground ml-3">
                                    {inv.created_at ? format(new Date(inv.created_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">{inv.status}</Badge>
                                  <span className="text-sm font-semibold">{formatCurrency(Number(inv.total_amount))}</span>
                                </div>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminVendas;
