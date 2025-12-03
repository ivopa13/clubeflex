import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  type: "customer" | "specifier";
  id: string;
  name: string;
  email: string;
  doc: string;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function sendEmail(resendApiKey: string, to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Flex Clube <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao enviar email: ${error}`);
  }

  return await response.json();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, id, name, email, doc }: CreateUserRequest = await req.json();

    console.log(`Creating user account for ${type}: ${name} (${email})`);

    if (!email || !email.includes("@")) {
      throw new Error("Email inválido ou não cadastrado");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const tempPassword = generatePassword();

    // Create user with admin API
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: name,
        doc: doc,
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      if (createError.message.includes("already been registered")) {
        throw new Error("Este email já está cadastrado no sistema");
      }
      throw createError;
    }

    console.log(`User created: ${userData.user.id}`);

    // Update customer/specifier with user_id
    const table = type === "customer" ? "customers" : "specifiers";
    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update({ user_id: userData.user.id })
      .eq("id", id);

    if (updateError) {
      console.error(`Error linking user to ${type}:`, updateError);
      // Don't fail, user was created successfully
    }

    // Add user role
    const role = type === "customer" ? "customer" : "specifier";
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userData.user.id, role });

    if (roleError) {
      console.error("Error adding user role:", roleError);
    }

    // Get the app URL (using the origin from the request or fallback)
    const appUrl = req.headers.get("origin") || "https://clube.flexbh.com.br";
    const loginUrl = `${appUrl}/auth`;

    // Send welcome email
    const typeLabel = type === "customer" ? "Cliente" : "Especificador";
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Montserrat', Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #18375d; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #ff914d; margin: 0; font-size: 28px;">Flex Clube</h1>
            <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 14px;">Programa de Fidelidade</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #18375d; margin-top: 0;">Olá, ${name}! 👋</h2>
            
            <p style="color: #333; line-height: 1.6;">
              Seja muito bem-vindo ao <strong style="color: #ff914d;">Flex Clube</strong>! 
              Sua conta de ${typeLabel} foi criada com sucesso.
            </p>
            
            <div style="background-color: #f8f9fa; border-left: 4px solid #ff914d; padding: 20px; margin: 25px 0; border-radius: 4px;">
              <p style="margin: 0 0 15px 0; color: #18375d; font-weight: bold;">Seus dados de acesso:</p>
              <p style="margin: 5px 0; color: #333;"><strong>Login:</strong> ${email}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Senha provisória:</strong> <code style="background-color: #e9ecef; padding: 3px 8px; border-radius: 4px; font-size: 16px;">${tempPassword}</code></p>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              ⚠️ <strong>Importante:</strong> Por segurança, recomendamos que você altere sua senha no primeiro acesso.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" style="background-color: #ff914d; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
                Acessar Flex Clube
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
              Este é um email automático do Flex Clube.<br>
              Em caso de dúvidas, entre em contato com a equipe Flex.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await sendEmail(resendApiKey, email, "Bem-vindo ao Flex Clube! 🎉", emailHtml);
      console.log(`Welcome email sent to ${email}`);
    } catch (emailError: any) {
      console.error("Error sending email:", emailError);
      return new Response(
        JSON.stringify({ 
          success: true, 
          userId: userData.user.id,
          warning: "Usuário criado, mas houve erro ao enviar email" 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: userData.user.id,
        message: "Usuário criado e email enviado com sucesso" 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("Error in create-user-account:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao criar usuário" }),
      { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
