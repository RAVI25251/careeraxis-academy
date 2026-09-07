// CareerAxis Academy admin OTP endpoint.
// This endpoint is intentionally provider-agnostic. For a $0 setup, use a Google Apps Script
// mail relay owned by careeraxisacademy@gmail.com, or another provider available to the owner.
// NEVER put provider secrets in frontend JavaScript.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED = new Set(["careeraxisacademy@gmail.com", "ravitejasiddana@gmail.com"]);
const OTP_TTL_MS = 5 * 60 * 1000;

function json(body: unknown, status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}})}

serve(async (req) => {
  if (req.method !== "POST") return json({ok:false,message:"Method Not Allowed"},405);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {global:{headers:{Authorization:req.headers.get("Authorization")||""}}});
  const {data:{user}} = await supabase.auth.getUser();
  const email = String(user?.email||"").toLowerCase();
  if (!user || !ALLOWED.has(email)) return json({ok:false,message:"Unauthorized admin account."},403);

  const body = await req.json().catch(()=>({}));
  if (body.action === "request") {
    // Provider integration is intentionally not hard-coded. Store OTP hash + expiry in a secure
    // server-side store, then send the code to careeraxisacademy@gmail.com.
    // See docs/ADMIN-SOP.md for the free Google Apps Script relay setup.
    return json({ok:false,message:"OTP mail relay is not configured. Complete the OTP section in ADMIN-SOP.md."},501);
  }
  if (body.action === "verify") {
    return json({ok:false,message:"OTP verification store is not configured. Complete the OTP section in ADMIN-SOP.md."},501);
  }
  return json({ok:false,message:"Invalid action."},400);
});
