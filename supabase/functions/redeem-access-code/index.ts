import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const expectedCode = Deno.env.get("MACH_ACCESS_CODE");
    if (!url || !anonKey || !serviceRoleKey || !expectedCode) {
      throw new Error("The access-code function is not fully configured.");
    }

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) {
      return Response.json({ error: "Sign in before redeeming the access code." }, { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Your session could not be verified. Please sign in again." }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const submittedCode = typeof body.code === "string" ? body.code.trim() : "";
    if (!submittedCode || submittedCode !== expectedCode) {
      return Response.json({ error: "That access code wasn't recognized. Check it and try again." }, { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: updateError } = await adminClient
      .from("member_profiles")
      .update({
        access_status: "approved",
        access_code_redeemed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        approved_by: null,
      })
      .eq("id", user.id);

    if (updateError) throw updateError;
    return Response.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("redeem-access-code:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not redeem the access code." },
      { status: 500, headers: corsHeaders },
    );
  }
});
