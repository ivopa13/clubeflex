import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, Search, CalendarIcon, DollarSign, Receipt, TrendingUp } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type DateRange = {
  from: Date;
  to: Date;
};

type PresetFilter = "this_month" | "last_month" | "this_year" | "custom";

const AdminFaturas = () => {
  const today = new Date();
  const [ascending, setAscending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
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

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["admin-invoices", ascending, dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          customer:customers(name),
          specifier:specifiers(name)
        `)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString())
        .order("invoice_id_ext", { ascending });

      if (error) throw error;
      return data;
    },
  });

  const filteredInvoices = useMemo(() => {
    if (!invoices || !searchTerm.trim()) return invoices;
    
    const term = searchTerm.toLowerCase().trim();
    return invoices.filter((invoice: any) => 
      invoice.invoice_id_ext?.toLowerCase().includes(term) ||
      invoice.order_number?.toLowerCase().includes(term) ||
      invoice.customer?.name?.toLowerCase().includes(term) ||
      invoice.specifier?.name?.toLowerCase().includes(term)
    );
  }, [invoices, searchTerm]);

  const metrics = useMemo(() => {
    const data = invoices || [];
    const totalRevenue = data.reduce((sum, inv: any) => sum + Number(inv.total_amount), 0);
    const ticketCount = data.length;
    const avgTicket = ticketCount > 0 ? totalRevenue / ticketCount : 0;
    return { totalRevenue, ticketCount, avgTicket };
  }, [invoices]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusLabel = (status: string, releasedCustomer: number, releasedSpecifier: number) => {
    const totalReleased = Number(releasedCustomer) + Number(releasedSpecifier);
    if (totalReleased > 0) {
      return { label: "Disponível", variant: "default" as const, className: "bg-green-500 text-white hover:bg-green-600" };
    }
    return { label: "Pendente", variant: "secondary" as const, className: "" };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Faturas</h1>
        
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
                      onSelect={(date) =>
                        date &&
                        setTempDateRange((prev) => ({
                          ...prev,
                          from: startOfDay(date),
                        }))
                      }
                      locale={ptBR}
                      className={cn("p-3 pointer-events-auto border rounded-md")}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Até:</p>
                    <Calendar
                      mode="single"
                      selected={tempDateRange.to}
                      onSelect={(date) =>
                        date &&
                        setTempDateRange((prev) => ({
                          ...prev,
                          to: endOfDay(date),
                        }))
                      }
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
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
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
            <CardTitle className="text-sm font-medium">Número de Faturas</CardTitle>
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

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, pedido, cliente ou especificador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAscending(!ascending)}
          className="gap-2"
        >
          <ArrowUpDown className="h-4 w-4" />
          {ascending ? "Crescente" : "Decrescente"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Faturas do Período</CardTitle>
          <CardDescription>
            {filteredInvoices?.length || 0} faturas encontradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nº Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Especificador</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Total de Pontos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices?.map((invoice: any) => {
                    const status = getStatusLabel(
                      invoice.status,
                      invoice.released_points_customer,
                      invoice.released_points_specifier
                    );
                    
                    const totalPoints = Number(invoice.pending_points_customer) + 
                                       Number(invoice.released_points_customer) + 
                                       Number(invoice.pending_points_specifier) + 
                                       Number(invoice.released_points_specifier);
                    
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-sm">{invoice.invoice_id_ext}</TableCell>
                        <TableCell className="font-mono text-sm">{invoice.order_number || "-"}</TableCell>
                        <TableCell className="font-medium">{invoice.customer?.name || "N/A"}</TableCell>
                        <TableCell>{invoice.specifier?.name || "-"}</TableCell>
                        <TableCell>R$ {Number(invoice.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="font-bold">
                          {totalPoints.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} pontos
                        </TableCell>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminFaturas;
