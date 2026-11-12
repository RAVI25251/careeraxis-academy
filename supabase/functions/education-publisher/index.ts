import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-careeraxis-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedCategories = new Set([
  "class 10",
  "ssc",
  "intermediate 1st year",
  "intermediate 2nd year",
  "intermediate",
  "neet",
  "jee main",
  "jee advanced",
  "mbbs counselling",
  "engineering counselling",
  "josaa",
  "csab",
  "ap eapcet",
  "tg eapcet",
  "hall ticket",
  "timetable",
  "result",
  "admission",
  "counselling",
  "seat allotment",
  "certificate verification",
  "web options",
]);

type EducationPayload = {
  title?: string;
  title_te?: string;
  category?: string;
  description?: string;
  description_te?: string;
  official_source?: string;
  official_url?: string;
  official_link?: string;
  date?: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function cleanText(value: unknown, maxLength = 5000): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/\s+/g, " ").trim();

  if (!cleaned) return null;

  return cleaned.slice(0, maxLength);
}

function validHttpsUrl(value: string | null): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string {
  const url = new URL(value);

  url.hash = "";

  if (
    url.pathname !== "/" &&
    url.pathname.endsWith("/")
  ) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString().toLowerCase();
}

function validDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function isExpired(value: string): boolean {
  const eventDate = new Date(`${value}T23:59:59Z`);
  const now = new Date();

  const todayUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  );

  return eventDate < todayUtc;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function logAutomation(
  db: ReturnType<typeof createClient>,
  status: string,
  summary: string,
): Promise<void> {
  try {
    await db.from("automation_logs").insert({
      automation_name: "careeraxis-education-publisher",
      status,
      summary: summary.slice(0, 2000),
    });
  } catch {
    // Logging failures must not expose internal errors or stop publishing.
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason: "Only POST requests are supported",
      },
      405,
    );
  }

  /*
   * Authenticate requests using the shared CareerAxis secret.
   * Copilot Studio will later send this value through X-CareerAxis-Key.
   */
  const configuredSecret = Deno.env.get("AUTOMATION_SECRET") ?? "";
  const suppliedSecret = request.headers.get("x-careeraxis-key") ?? "";

  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return jsonResponse(
      {
        success: false,
        status: "unauthorized",
        reason: "Invalid publishing credentials",
      },
      401,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      {
        success: false,
        status: "error",
        reason: "Publishing service is not configured",
      },
      500,
    );
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let payload: EducationPayload;

  try {
    payload = await request.json();
  } catch {
    await logAutomation(db, "rejected", "Invalid JSON request");

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason: "Request body must contain valid JSON",
      },
      400,
    );
  }

  const educationUpdate = {
    title: cleanText(payload.title, 500),
    title_te: cleanText(payload.title_te, 500),
    category: cleanText(payload.category, 150),
    description: cleanText(payload.description, 15000),
    description_te: cleanText(payload.description_te, 15000),
    official_source: cleanText(payload.official_source, 500),
    official_url: cleanText(payload.official_url, 2000),
    official_link: cleanText(
      payload.official_link ?? payload.official_url,
      2000,
    ),
    date: cleanText(payload.date, 10),
  };

  const requiredFields: Array<[string, string | null]> = [
    ["title", educationUpdate.title],
    ["category", educationUpdate.category],
    ["description", educationUpdate.description],
    ["official_source", educationUpdate.official_source],
    ["official_url", educationUpdate.official_url],
    ["date", educationUpdate.date],
  ];

  const missingField = requiredFields.find(([, value]) => !value);

  if (missingField) {
    const reason = `Missing required field: ${missingField[0]}`;

    await logAutomation(db, "rejected", reason);

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason,
      },
      400,
    );
  }

  const normalizedCategory = educationUpdate.category!.toLowerCase();

  if (!allowedCategories.has(normalizedCategory)) {
    const reason =
      `Unsupported education category: ${educationUpdate.category}`;

    await logAutomation(db, "rejected", reason);

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason,
        allowed_categories: Array.from(allowedCategories),
      },
      400,
    );
  }

  if (!validHttpsUrl(educationUpdate.official_url)) {
    await logAutomation(db, "rejected", "Invalid official_url");

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason: "official_url must be a valid HTTPS URL",
      },
      400,
    );
  }

  if (!validHttpsUrl(educationUpdate.official_link)) {
    await logAutomation(db, "rejected", "Invalid official_link");

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason: "official_link must be a valid HTTPS URL",
      },
      400,
    );
  }

  if (!validDate(educationUpdate.date)) {
    await logAutomation(db, "rejected", "Invalid education event date");

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason: "date must use a valid YYYY-MM-DD format",
      },
      400,
    );
  }

  /*
   * Results may be historically useful even after their release date.
   * Other time-sensitive notifications are rejected when expired.
   */
  const permanentCategories = new Set([
    "result",
  ]);

  if (
    isExpired(educationUpdate.date!) &&
    !permanentCategories.has(normalizedCategory)
  ) {
    await logAutomation(
      db,
      "rejected",
      `Expired education update rejected: ${educationUpdate.title}`,
    );

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason: "The education update date has expired",
      },
      400,
    );
  }

  const normalizedOfficialUrl = normalizeUrl(
    educationUpdate.official_url!,
  );

  /*
   * The current education_updates table has no source_hash column.
   * This fingerprint is used for logging, while duplicate detection
   * uses title, official_url and date.
   */
  const sourceFingerprint = await sha256(
    [
      educationUpdate.title!.toLowerCase(),
      normalizedOfficialUrl,
      educationUpdate.date,
    ].join("|"),
  );

  const { data: duplicateRows, error: duplicateError } = await db
    .from("education_updates")
    .select("id, title, status, published")
    .ilike("title", educationUpdate.title!)
    .eq("official_url", educationUpdate.official_url!)
    .eq("date", educationUpdate.date!)
    .limit(1);

  if (duplicateError) {
    await logAutomation(
      db,
      "error",
      "Education duplicate validation failed",
    );

    return jsonResponse(
      {
        success: false,
        status: "error",
        reason: "Unable to validate the education update",
      },
      500,
    );
  }

  const duplicate = duplicateRows?.[0];

  if (duplicate) {
    await logAutomation(
      db,
      "duplicate",
      `Duplicate skipped: ${educationUpdate.title}; fingerprint=${sourceFingerprint}`,
    );

    return jsonResponse({
      success: true,
      status: "duplicate",
      existing_update_id: duplicate.id,
      publication_status: duplicate.status,
      published: duplicate.published,
    });
  }

  const now = new Date().toISOString();

  const { data: createdUpdate, error: insertError } = await db
    .from("education_updates")
    .insert({
      title: educationUpdate.title,
      title_te: educationUpdate.title_te,
      category: educationUpdate.category,
      description: educationUpdate.description,
      description_te: educationUpdate.description_te,
      official_source: educationUpdate.official_source,
      official_url: educationUpdate.official_url,
      official_link: educationUpdate.official_link,
      date: educationUpdate.date,

      /*
       * These values override the table's published=true default.
       * Every Copilot-created record therefore requires review first.
       */
      status: "draft",
      published: false,
      published_at: null,
      updated_at: now,
    })
    .select(
      "id, title, category, status, published, date, official_url",
    )
    .single();

  if (insertError || !createdUpdate) {
    await logAutomation(
      db,
      "error",
      `Education update insertion failed: ${educationUpdate.title}`,
    );

    return jsonResponse(
      {
        success: false,
        status: "error",
        reason: "Unable to save the education update",
      },
      500,
    );
  }

  await logAutomation(
    db,
    "created",
    `Draft created: ${createdUpdate.title} (${createdUpdate.id}); fingerprint=${sourceFingerprint}`,
  );

  return jsonResponse(
    {
      success: true,
      status: "created",
      education_update_id: createdUpdate.id,
      title: createdUpdate.title,
      category: createdUpdate.category,
      date: createdUpdate.date,
      published: createdUpdate.published,
      publication_status: createdUpdate.status,
    },
    201,
  );
});
