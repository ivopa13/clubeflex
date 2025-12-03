import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceTypeUpdate {
  invoice_id_ext: string;
  movement_type: "produto" | "servico";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { updates } = await req.json() as { updates: InvoiceTypeUpdate[] };

    if (!updates || !Array.isArray(updates)) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid 'updates' array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Received ${updates.length} invoice type updates`);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const update of updates) {
      const { invoice_id_ext, movement_type } = update;

      if (!invoice_id_ext || !movement_type) {
        errors.push(`Invalid update: ${JSON.stringify(update)}`);
        errorCount++;
        continue;
      }

      if (!["produto", "servico"].includes(movement_type)) {
        errors.push(`Invalid movement_type for ${invoice_id_ext}: ${movement_type}`);
        errorCount++;
        continue;
      }

      const { error } = await supabase
        .from("invoices")
        .update({ movement_type })
        .eq("invoice_id_ext", invoice_id_ext);

      if (error) {
        errors.push(`Error updating ${invoice_id_ext}: ${error.message}`);
        errorCount++;
      } else {
        successCount++;
      }
    }

    console.log(`Update complete: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        successCount,
        errorCount,
        errors: errors.slice(0, 10), // Limit error messages
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing request:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
