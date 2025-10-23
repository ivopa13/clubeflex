import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getUserActorInfo } from "@/lib/userRole";

export interface PortalBalance {
  pending: number;
  redeemable: number;
  redeemed: number;
  actorId: string | null;
  actorType: "customer" | "specifier" | null;
}

export const usePortalBalance = () => {
  return useQuery({
    queryKey: ["portal-balance"],
    queryFn: async (): Promise<PortalBalance> => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Get user actor info (customer or specifier)
      const { actorType, actorId } = await getUserActorInfo();

      if (!actorType || !actorId) {
        return { pending: 0, redeemable: 0, redeemed: 0, actorId: null, actorType: null };
      }

      // Get ledger entries
      const actorIdColumn = actorType === "customer" ? "actor_id_customer" : "actor_id_specifier";
      const { data: ledger, error: ledgerError } = await supabase
        .from("points_ledger")
        .select("type, points")
        .eq("actor_type", actorType)
        .eq(actorIdColumn, actorId);

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
        actorId,
        actorType,
      };
    },
  });
};
