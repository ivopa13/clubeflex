import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CustomerBalance {
  pending: number;
  redeemable: number;
  redeemed: number;
  customerId: string | null;
}

export const useCustomerBalance = () => {
  return useQuery({
    queryKey: ["customer-balance"],
    queryFn: async (): Promise<CustomerBalance> => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Get customer record
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (customerError) throw customerError;
      if (!customer) {
        return { pending: 0, redeemable: 0, redeemed: 0, customerId: null };
      }

      // Get ledger entries
      const { data: ledger, error: ledgerError } = await supabase
        .from("points_ledger")
        .select("type, points")
        .eq("actor_type", "customer")
        .eq("actor_id_customer", customer.id);

      if (ledgerError) throw ledgerError;

      let pending = 0;
      let redeemable = 0;
      let redeemed = 0;

      ledger?.forEach((entry) => {
        const points = Number(entry.points);
        switch (entry.type) {
          case "pending_add":
            pending += points;
            break;
          case "pending_sub":
            pending += points; // já vem negativo
            break;
          case "released_add":
            redeemable += points;
            break;
          case "released_sub":
            redeemable += points; // já vem negativo
            break;
          case "redeem":
            redeemed += Math.abs(points); // redeem é negativo, queremos positivo
            redeemable += points; // subtrai do resgatável
            break;
          case "refund":
            redeemable += points; // adiciona de volta ao resgatável
            redeemed -= points; // remove do resgatado
            break;
        }
      });

      return {
        pending: Math.max(0, pending),
        redeemable: Math.max(0, redeemable),
        redeemed: Math.max(0, redeemed),
        customerId: customer.id,
      };
    },
  });
};
