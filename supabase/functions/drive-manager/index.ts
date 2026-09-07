import { createClient } from "npm:@supabase/supabase-js@2";
import { google } from "npm:googleapis@144";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://careeraxisacademy.in",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_EMAILS = [
  "careeraxisacademy@gmail.com",
  "ravitejasiddana@gmail.com",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Authentication required" }, 401);
    }

    const accessToken = authHeader.replace("Bearer ", "");

    const publishableKeysRaw = Deno.env.get(
      "SUPABASE_PUBLISHABLE_KEYS",
    );

    if (!publishableKeysRaw) {
      throw new Error("Supabase publishable key configuration is missing");
    }

    const publishableKeys = JSON.parse(publishableKeysRaw);
    const publishableKey = publishableKeys["default"];

    if (!publishableKey) {
      throw new Error("Default Supabase publishable key not found");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      publishableKey,
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return json(
        { error: "Invalid or expired login session" },
        401,
      );
    }

    const email = user.email?.toLowerCase();

    if (!email || !ADMIN_EMAILS.includes(email)) {
      return json(
        { error: "Access denied. Administrator account required." },
        403,
      );
    }

    const serviceAccountRaw = Deno.env.get(
      "GOOGLE_SERVICE_ACCOUNT_JSON",
    );

    if (!serviceAccountRaw) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON secret is missing",
      );
    }

    const serviceAccount = JSON.parse(serviceAccountRaw);

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
        project_id: serviceAccount.project_id,
      },
      scopes: [
        "https://www.googleapis.com/auth/drive",
      ],
    });

    const drive = google.drive({
      version: "v3",
      auth,
    });

    const result = await drive.files.list({
      q:
        "name = 'CareerAxis Academy' " +
        "and mimeType = 'application/vnd.google-apps.folder' " +
        "and trashed = false",
      fields: "files(id,name,mimeType,parents,webViewLink)",
      pageSize: 20,
      spaces: "drive",
    });

    const folders = result.data.files ?? [];

    return json({
      success: true,
      authenticatedAdmin: email,
      driveConnection: "connected",
      folders: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        mimeType: folder.mimeType,
        webViewLink: folder.webViewLink ?? null,
      })),
    });
  } catch (error) {
    console.error("drive-manager error:", error);

    return json(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "Unknown server error",
      },
      500,
    );
  }
});

function json(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}