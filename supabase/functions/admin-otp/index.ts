import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://careeraxisacademy.in",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED = new Set([
  "careeraxisacademy@gmail.com",
  "ravitejasiddana@gmail.com",
]);

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json(
        { ok: false, message: "Method Not Allowed" },
        405,
      );
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json(
        { ok: false, message: "Authentication required." },
        401,
      );
    }

    const accessToken = authorization.replace("Bearer ", "");

    // Verify the logged-in Supabase user.
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(accessToken);

    if (userError || !user) {
      return json(
        { ok: false, message: "Invalid or expired login session." },
        401,
      );
    }

    const email = String(user.email || "").toLowerCase();

    if (!ALLOWED.has(email)) {
      return json(
        { ok: false, message: "Unauthorized admin account." },
        403,
      );
    }

    // Service-role client is used only inside this server-side function.
    // It is NEVER exposed to the website.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));

    // ------------------------------------------------------------
    // REQUEST OTP
    // ------------------------------------------------------------
    if (body.action === "request") {
      const otp = String(
        Math.floor(100000 + Math.random() * 900000),
      );

      const otpHash = await sha256(otp);

      const expiresAt = new Date(
        Date.now() + OTP_TTL_MS,
      ).toISOString();

      // Remove previous OTPs for this administrator.
      await supabaseAdmin
        .from("admin_otp")
        .delete()
        .eq("admin_email", email);

      // Store only the hash, never the actual OTP.
      const { error: insertError } = await supabaseAdmin
        .from("admin_otp")
        .insert({
          admin_email: email,
          otp_hash: otpHash,
          expires_at: expiresAt,
          attempts: 0,
          used: false,
        });

      if (insertError) {
        console.error("OTP database error:", insertError);

        return json(
          {
            ok: false,
            message: "Could not create OTP.",
          },
          500,
        );
      }

      const relayUrl = Deno.env.get("OTP_RELAY_URL");
      const relaySecret = Deno.env.get("OTP_RELAY_SECRET");

      if (!relayUrl || !relaySecret) {
        return json(
          {
            ok: false,
            message: "OTP relay configuration is missing.",
          },
          500,
        );
      }

      // Send OTP to the protected CareerAxis mailbox.
      const relayResponse = await fetch(relayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret: relaySecret,
          otp,
        }),
      });

      const relayResult = await relayResponse
        .json()
        .catch(() => ({}));

      if (!relayResponse.ok || !relayResult.ok) {
        console.error("OTP relay error:", relayResult);

        // Remove the unusable OTP if email delivery failed.
        await supabaseAdmin
          .from("admin_otp")
          .delete()
          .eq("admin_email", email);

        return json(
          {
            ok: false,
            message: "Failed to send OTP email.",
          },
          502,
        );
      }

      return json({
        ok: true,
        message: "OTP sent to the protected security mailbox.",
        expiresInSeconds: 300,
      });
    }

    // ------------------------------------------------------------
    // VERIFY OTP
    // ------------------------------------------------------------
    if (body.action === "verify") {
      const submittedOtp = String(body.otp || "").trim();

      if (!/^\d{6}$/.test(submittedOtp)) {
        return json(
          {
            ok: false,
            message: "Enter the 6-digit OTP.",
          },
          400,
        );
      }

      const { data: record, error: fetchError } =
        await supabaseAdmin
          .from("admin_otp")
          .select(
            "id, otp_hash, expires_at, attempts, used",
          )
          .eq("admin_email", email)
          .eq("used", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (fetchError) {
        console.error("OTP lookup error:", fetchError);

        return json(
          {
            ok: false,
            message: "Could not verify OTP.",
          },
          500,
        );
      }

      if (!record) {
        return json(
          {
            ok: false,
            message: "No active OTP found. Request a new OTP.",
          },
          400,
        );
      }

      if (
        new Date(record.expires_at).getTime() <=
        Date.now()
      ) {
        await supabaseAdmin
          .from("admin_otp")
          .delete()
          .eq("id", record.id);

        return json(
          {
            ok: false,
            message: "OTP has expired. Request a new OTP.",
          },
          400,
        );
      }

      if (record.attempts >= MAX_ATTEMPTS) {
        await supabaseAdmin
          .from("admin_otp")
          .delete()
          .eq("id", record.id);

        return json(
          {
            ok: false,
            message:
              "Too many incorrect attempts. Request a new OTP.",
          },
          429,
        );
      }

      const submittedHash = await sha256(submittedOtp);

      if (submittedHash !== record.otp_hash) {
        const newAttempts = record.attempts + 1;

        await supabaseAdmin
          .from("admin_otp")
          .update({
            attempts: newAttempts,
          })
          .eq("id", record.id);

        return json(
          {
            ok: false,
            message: "Incorrect OTP.",
            attemptsRemaining:
              Math.max(0, MAX_ATTEMPTS - newAttempts),
          },
          400,
        );
      }

      // OTP is valid. Mark it as used.
      await supabaseAdmin
        .from("admin_otp")
        .update({
          used: true,
        })
        .eq("id", record.id);

      return json({
        ok: true,
        message: "OTP verified successfully.",
      });
    }

    return json(
      {
        ok: false,
        message: "Invalid action.",
      },
      400,
    );
  } catch (error) {
    console.error("admin-otp error:", error);

    return json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown server error.",
      },
      500,
    );
  }
});

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);

  const hash = await crypto.subtle.digest(
    "SHA-256",
    data,
  );

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(
  body: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}
