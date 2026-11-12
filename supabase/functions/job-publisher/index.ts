import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-careeraxis-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JobPayload = {
  title?: string;
  company?: string;
  category?: string;
  location?: string;
  job_type?: string;
  experience?: string;
  qualification?: string;
  skills?: string;
  salary?: string;
  last_date?: string;
  apply_url?: string;
  source_name?: string;
  source_url?: string;
  description?: string;
  name_te?: string;
  description_te?: string;
  featured?: boolean;
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
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

function isExpired(value: string): boolean {
  const deadline = new Date(`${value}T23:59:59Z`);

  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  return deadline < todayUtc;
}

function createSlug(title: string, company: string): string {
  const base = `${title}-${company}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${base}-${Date.now().toString(36)}`.slice(0, 180);
}

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

async function logAutomation(
  db: ReturnType<typeof createClient>,
  status: string,
  summary: string,
): Promise<void> {
  try {
    await db.from("automation_logs").insert({
      automation_name: "careeraxis-job-publisher",
      status,
      summary: summary.slice(0, 2000),
    });
  } catch {
    // Logging failure must not expose internal details or crash the request.
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

  let payload: JobPayload;

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

  const job = {
    title: cleanText(payload.title, 300),
    company: cleanText(payload.company, 300),
    category: cleanText(payload.category, 100),
    location: cleanText(payload.location, 300),
    job_type: cleanText(payload.job_type, 100),
    experience: cleanText(payload.experience, 300),
    qualification: cleanText(payload.qualification, 1000),
    skills: cleanText(payload.skills, 1000),
    salary: cleanText(payload.salary, 300),
    last_date: cleanText(payload.last_date, 10),
    apply_url: cleanText(payload.apply_url, 2000),
    source_name: cleanText(payload.source_name, 300),
    source_url: cleanText(payload.source_url, 2000),
    description: cleanText(payload.description, 10000),
    name_te: cleanText(payload.name_te, 500),
    description_te: cleanText(payload.description_te, 10000),
    featured: payload.featured === true,
  };

  const requiredFields: Array<[string, string | null]> = [
    ["title", job.title],
    ["company", job.company],
    ["last_date", job.last_date],
    ["apply_url", job.apply_url],
    ["source_name", job.source_name],
    ["source_url", job.source_url],
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

  if (!validHttpsUrl(job.apply_url)) {
    await logAutomation(db, "rejected", "Invalid apply_url");

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason: "apply_url must be a valid HTTPS URL",
      },
      400,
    );
  }

  if (!validHttpsUrl(job.source_url)) {
    await logAutomation(db, "rejected", "Invalid source_url");

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason: "source_url must be a valid HTTPS URL",
      },
      400,
    );
  }

  if (!validDate(job.last_date)) {
    await logAutomation(db, "rejected", "Invalid last_date");

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason: "last_date must use YYYY-MM-DD format",
      },
      400,
    );
  }

  if (isExpired(job.last_date!)) {
    await logAutomation(
      db,
      "rejected",
      `Expired job rejected: ${job.title}`,
    );

    return jsonResponse(
      {
        success: false,
        status: "rejected",
        reason: "Application deadline has expired",
      },
      400,
    );
  }

  const normalizedSourceUrl = new URL(job.source_url!)
    .toString()
    .toLowerCase();

  const normalizedApplyUrl = new URL(job.apply_url!)
    .toString()
    .toLowerCase();

  const sourceHash = await sha256(
    [
      job.title!.toLowerCase(),
      job.company!.toLowerCase(),
      normalizedSourceUrl,
      normalizedApplyUrl,
    ].join("|"),
  );

  const { data: duplicate, error: duplicateError } = await db
    .from("jobs")
    .select("id, slug, title")
    .eq("source_hash", sourceHash)
    .maybeSingle();

  if (duplicateError) {
    await logAutomation(db, "error", "Duplicate validation failed");

    return jsonResponse(
      {
        success: false,
        status: "error",
        reason: "Unable to validate the job",
      },
      500,
    );
  }

  if (duplicate) {
    await logAutomation(
      db,
      "duplicate",
      `Duplicate skipped: ${job.title}`,
    );

    return jsonResponse({
      success: true,
      status: "duplicate",
      existing_job_id: duplicate.id,
      slug: duplicate.slug,
    });
  }

  const slug = createSlug(job.title!, job.company!);

  const { data: createdJob, error: insertError } = await db
    .from("jobs")
    .insert({
      ...job,
      slug,
      source_hash: sourceHash,
      status: "draft",
      published: false,
      updated_at: new Date().toISOString(),
    })
    .select("id, slug, title, status, published")
    .single();

  if (insertError || !createdJob) {
    await logAutomation(
      db,
      "error",
      `Job insertion failed: ${job.title}`,
    );

    return jsonResponse(
      {
        success: false,
        status: "error",
        reason: "Unable to save the job",
      },
      500,
    );
  }

  await logAutomation(
    db,
    "created",
    `Draft created: ${createdJob.title} (${createdJob.id})`,
  );

  return jsonResponse(
    {
      success: true,
      status: "created",
      job_id: createdJob.id,
      slug: createdJob.slug,
      published: createdJob.published,
      publication_status: createdJob.status,
    },
    201,
  );
});
