import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAdminStats = () => {
  return useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      // Total de pontos pendentes (todos os usuários)
      const { data: pendingData } = await supabase
        .from("points_ledger")
        .select("points, type")
        .in("type", ["pending_add", "pending_sub"]);

      const totalPending = (pendingData || []).reduce((sum, entry) => {
        return entry.type === "pending_add" 
          ? sum + Number(entry.points) 
          : sum - Number(entry.points);
      }, 0);

      // Total de pontos resgatáveis (todos os usuários)
      const { data: redeemableData } = await supabase
        .from("points_ledger")
        .select("points, type")
        .in("type", ["released_add", "released_sub", "redeem"]);

      const totalRedeemable = (redeemableData || []).reduce((sum, entry) => {
        if (entry.type === "released_add") return sum + Number(entry.points);
        if (entry.type === "released_sub" || entry.type === "redeem") return sum - Number(entry.points);
        return sum;
      }, 0);

      // Total resgatado no mês
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: redeemedThisMonth } = await supabase
        .from("points_ledger")
        .select("points")
        .eq("type", "redeem")
        .gte("created_at", startOfMonth.toISOString());

      const totalRedeemedThisMonth = (redeemedThisMonth || []).reduce(
        (sum, entry) => sum + Math.abs(Number(entry.points)),
        0
      );

      // Últimos resgates
      const { data: recentRedemptions } = await supabase
        .from("redemptions")
        .select(`
          *,
          actor_id_customer:customers(name),
          actor_id_specifier:specifiers(name)
        `)
        .order("created_at", { ascending: false })
        .limit(5);

      // Últimas faturas
      const { data: recentInvoices } = await supabase
        .from("invoices")
        .select(`
          *,
          customer:customers(name),
          specifier:specifiers(name)
        `)
        .order("created_at", { ascending: false })
        .limit(5);

      // Valor do ponto
      const { data: settings } = await supabase
        .from("program_settings")
        .select("point_monetary_value")
        .limit(1)
        .maybeSingle();

      const pointValue = Number((settings as any)?.point_monetary_value ?? 0.02);

      return {
        totalPending,
        totalRedeemable,
        totalRedeemedThisMonth,
        pointMonetaryValue: pointValue,
        recentRedemptions: recentRedemptions || [],
        recentInvoices: recentInvoices || [],
      };
    },
  });
};
