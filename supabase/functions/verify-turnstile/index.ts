import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VerifyRequest {
  token: string;
}

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => null)) as VerifyRequest | null;
    const token = body?.token;

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Token não fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const secretKey = Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET_KEY");
    if (!secretKey) {
      console.error("CLOUDFLARE_TURNSTILE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Configuração inválida do servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the token with Cloudflare
    const formData = new FormData();
    formData.append("secret", secretKey);
    formData.append("response", token);

    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });

    const outcome = (await result.json()) as TurnstileResponse;

    if (outcome.success) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.error("Turnstile verification failed:", outcome["error-codes"]);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Verificação de segurança falhou",
        codes: outcome["error-codes"],
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in verify-turnstile:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
