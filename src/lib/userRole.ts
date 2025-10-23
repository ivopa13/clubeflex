import { supabase } from "@/integrations/supabase/client";

export type UserActorType = "customer" | "specifier" | null;

export interface UserActorInfo {
  actorType: UserActorType;
  actorId: string | null;
}

export const getUserActorInfo = async (): Promise<UserActorInfo> => {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { actorType: null, actorId: null };
  }

  // Check if user is a customer
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (customer) {
    return { actorType: "customer", actorId: customer.id };
  }

  // Check if user is a specifier
  const { data: specifier } = await supabase
    .from("specifiers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (specifier) {
    return { actorType: "specifier", actorId: specifier.id };
  }

  return { actorType: null, actorId: null };
};
