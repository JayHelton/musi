import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return textResponse("Unauthorized", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return textResponse("Server misconfigured", 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return textResponse("Unauthorized", 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const path = new URL(req.url).pathname;

  if (path.endsWith("/export")) {
    if (req.method !== "POST") {
      return textResponse("Method Not Allowed", 405);
    }

    const [recordsResult, devicesResult, blobsResult] = await Promise.all([
      userClient.from("sync_records").select("*"),
      userClient.from("sync_devices").select("*"),
      userClient.from("sync_blobs").select("*"),
    ]);

    if (recordsResult.error || devicesResult.error || blobsResult.error) {
      const message = recordsResult.error?.message ??
        devicesResult.error?.message ??
        blobsResult.error?.message ??
        "Export failed";
      return jsonResponse({ ok: false, error: message }, 500);
    }

    return jsonResponse({
      ok: true,
      exportedAt: new Date().toISOString(),
      user: { id: user.id, email: user.email },
      records: recordsResult.data ?? [],
      devices: devicesResult.data ?? [],
      blobs: blobsResult.data ?? [],
    });
  }

  if (path.endsWith("/delete")) {
    if (req.method !== "POST") {
      return textResponse("Method Not Allowed", 405);
    }

    const userId = user.id;
    const prefix = `${userId}/`;

    const { data: storageObjects, error: listError } = await admin.storage
      .from("attachments")
      .list(userId);

    if (listError) {
      return jsonResponse({ ok: false, error: listError.message }, 500);
    }

    if (storageObjects && storageObjects.length > 0) {
      const paths = storageObjects
        .filter((obj) => obj.name)
        .map((obj) => `${prefix}${obj.name}`);
      if (paths.length > 0) {
        const { error: removeError } = await admin.storage.from("attachments").remove(paths);
        if (removeError) {
          return jsonResponse({ ok: false, error: removeError.message }, 500);
        }
      }
    }

    const deletes = await Promise.all([
      admin.from("sync_records").delete().eq("user_id", userId),
      admin.from("sync_devices").delete().eq("user_id", userId),
      admin.from("sync_blobs").delete().eq("user_id", userId),
      admin.from("sync_watermarks").delete().eq("user_id", userId),
    ]);

    const deleteError = deletes.find((result) => result.error)?.error;
    if (deleteError) {
      return jsonResponse({ ok: false, error: deleteError.message }, 500);
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      return jsonResponse({ ok: false, error: authDeleteError.message }, 500);
    }

    return jsonResponse({ ok: true });
  }

  return textResponse("Not Found", 404);
});
