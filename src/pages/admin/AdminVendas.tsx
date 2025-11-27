import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CalendarIcon, 
  DollarSign, 
  Receipt, 
  TrendingUp,
  CreditCard,
  Banknote,
  Wallet,
  PiggyBank
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
  "dinheiro": { label: "Dinheiro", icon: Banknote },
  "cartao_credito": { label: "Cartão Crédito", icon: CreditCard },
  "cartao_debito": { label: "Cartão Débito", icon: CreditCard },
  "pix": { label: "PIX", icon: Wallet },
  "boleto": { label: "Boleto", icon: Receipt },
  "transferencia": { label: "Transferência", icon: PiggyBank },
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

  // Fetch invoices data
  const { data: invoicesData, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ["sales-invoices", dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, total_amount, status, created_at")
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch payments data
  const { data: paymentsData, isLoading: isLoadingPayments } = useQuery({
    queryKey: ["sales-payments", dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, paid_amount, payment_type, paid_at")
        .gte("paid_at", dateRange.from.toISOString())
        .lte("paid_at", dateRange.to.toISOString());
      
      if (error) throw error;
      return data;
    },
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    const invoices = invoicesData || [];
    const payments = paymentsData || [];

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.paid_amount), 0);
    const ticketCount = invoices.length;
    const avgTicket = ticketCount > 0 ? totalRevenue / ticketCount : 0;

    // Group payments by type
    const paymentsByType = payments.reduce((acc, p) => {
      const type = p.payment_type || "unknown";
      if (!acc[type]) {
        acc[type] = { count: 0, total: 0 };
      }
      acc[type].count += 1;
      acc[type].total += Number(p.paid_amount);
      return acc;
    }, {} as Record<string, { count: number; total: number }>);

    return {
      totalRevenue,
      ticketCount,
      avgTicket,
      paymentsByType,
    };
  }, [invoicesData, paymentsData]);

  const isLoading = isLoadingInvoices || isLoadingPayments;

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

      {/* Payment Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tipos de Recebimento</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : Object.keys(metrics.paymentsByType).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhum pagamento encontrado no período selecionado
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(metrics.paymentsByType).map(([type, data]) => {
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
                        {data.count} transações • {percentage}%
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
