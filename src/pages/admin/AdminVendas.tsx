import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Wrench
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type DateRange = {
  from: Date;
  to: Date;
};

type PresetFilter = "this_month" | "last_month" | "this_year" | "custom";

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
  
  const [presetFilter, setPresetFilter] = useState<PresetFilter>("this_month");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(today),
    to: endOfMonth(today),
  });
  const [tempDateRange, setTempDateRange] = useState<DateRange>(dateRange);

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

  // Métricas gerais calculadas no banco (sem limite de 1000 linhas)
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

  // Breakdown por tipo de pagamento calculado no banco
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




  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Dashboard de Vendas</h1>
        
        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={presetFilter === "this_month" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetChange("this_month")}
          >
            Este Mês
          </Button>
          <Button
            variant={presetFilter === "last_month" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetChange("last_month")}
          >
            Último Mês
          </Button>
          <Button
            variant={presetFilter === "this_year" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetChange("this_year")}
          >
            Este Ano
          </Button>
          
          {/* Custom Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={presetFilter === "custom" ? "default" : "outline"}
                size="sm"
                className="min-w-[200px] justify-start text-left font-normal"
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
        Exibindo dados de {format(dateRange.from, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} até {format(dateRange.to, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
      </p>

      {/* Main Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(metrics.totalRevenue)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Número de Tickets</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
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
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(metrics.avgTicket)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vendas por Categoria (Produto vs Serviço) */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas de Produtos</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(metrics.productRevenue)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.productCount} vendas • {metrics.totalRevenue > 0 
                    ? ((metrics.productRevenue / metrics.totalRevenue) * 100).toFixed(1) 
                    : "0"}% do total
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas de Serviços</CardTitle>
            <Wrench className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(metrics.serviceRevenue)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.serviceCount} vendas • {metrics.totalRevenue > 0 
                    ? ((metrics.serviceRevenue / metrics.totalRevenue) * 100).toFixed(1) 
                    : "0"}% do total
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tipos de Venda */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tipos de Venda</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : Object.keys(metrics.salesByType).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhuma venda encontrada no período selecionado
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(metrics.salesByType).map(([type, data]) => {
                const typeInfo = paymentTypeLabels[type] || paymentTypeLabels["unknown"];
                const Icon = typeInfo.icon;
                const percentage = metrics.totalRevenue > 0 
                  ? ((data.total / metrics.totalRevenue) * 100).toFixed(1)
                  : "0";
                
                return (
                  <div
                    key={type}
                    className="flex items-center gap-4 p-4 rounded-lg border bg-card"
                  >
                    <div className="p-2 rounded-full bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{typeInfo.label}</p>
                      <p className="text-xl font-bold">{formatCurrency(data.total)}</p>
                      <p className="text-xs text-muted-foreground">
                        {data.count} vendas • {percentage}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminVendas;
