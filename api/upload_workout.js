const Busboy = require("busboy");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function parseTagIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(x => String(x));
    } catch {}
  }
  return [s];
}

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: 250 * 1024 * 1024 }
    });

    const fields = {};
    let file = null;

    bb.on("field", (name, val) => {
      if (fields[name] === undefined) fields[name] = val;
      else if (Array.isArray(fields[name])) fields[name].push(val);
      else fields[name] = [fields[name], val];
    });

    bb.on("file", (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      let size = 0;

      stream.on("data", d => {
        size += d.length;
        chunks.push(d);
      });

      stream.on("limit", () =>
        reject(Object.assign(new Error("File too large"), { status: 413 }))
      );
      stream.on("error", reject);

      stream.on("end", () => {
        file = {
          fieldname: name,
          filename: filename || "upload",
          mimetype: mimeType || "application/octet-stream",
          buffer: Buffer.concat(chunks),
          size
        };
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve({ fields, file }));

    req.pipe(bb);
  });
}

function randomId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2) + Date.now();
}

module.exports = async (req, res) => {
  // --- OPEN CORS (debug only) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Simple GET smoke test
  if (req.method === "GET") {
    return res
      .status(200)
      .send("upload_workout is alive (GET ok). Use POST with multipart/form-data to upload.");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const jwt = getBearerToken(req);
    if (!jwt) return res.status(401).json({ error: "Missing Bearer token" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const BUCKET = process.env.SUPABASE_BUCKET || "workout_files";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Missing Supabase env vars" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Invalid token", detail: userErr?.message });
    }
    const uid = userData.user.id;

    // Parse multipart
    const { fields, file } = await readMultipart(req);
    if (!file) return res.status(400).json({ error: "Missing file" });

    const description = (fields.description || "").toString().trim() || null;
    const tag_ids = parseTagIds(fields.tag_ids);
    if (!tag_ids.length) return res.status(400).json({ error: "Select at least one tag" });

    const isVideo = (file.mimetype || "").startsWith("video/");
    const isImage = (file.mimetype || "").startsWith("image/");
    if (!isVideo && !isImage) return res.status(400).json({ error: "Unsupported file type" });

    // Extension: keep image ext, force mp4 for video
    let ext = ".bin";
    if (isVideo) ext = ".mp4";
    else {
      const parts = (file.filename || "").split(".");
      ext = parts.length > 1 ? "." + parts.pop().toLowerCase() : ".jpg";
    }

    const storagePath = `${uid}/${Date.now()}-${randomId()}${ext}`;

    // Upload to Storage
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (upErr) {
      return res.status(500).json({ error: "Storage upload failed", detail: upErr.message });
    }

    // Create signed URL (100 years like before)
    const exp = 100 * 365 * 24 * 60 * 60;
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, exp);

    if (sErr || !signed?.signedUrl) {
      return res.status(500).json({ error: "Signed URL failed", detail: sErr?.message || "Missing signedUrl" });
    }

    const file_url = signed.signedUrl;

    // Insert workout (matches your existing schema)
    const { data: w, error: wErr } = await supabaseAdmin
      .from("workouts")
      .insert({ user_id: uid, file_url, description })
      .select("id")
      .single();

    if (wErr || !w?.id) {
      return res.status(500).json({ error: "DB insert workouts failed", detail: wErr?.message || "Unknown" });
    }

    // Insert tags
    const rows = tag_ids.map(tag_id => ({ workout_id: w.id, tag_id }));
    const { error: wtErr } = await supabaseAdmin.from("workout_tags").insert(rows);

    if (wtErr) {
      return res.status(500).json({ error: "DB insert workout_tags failed", detail: wtErr.message });
    }

    return res.json({ ok: true, workoutId: w.id, file_url });
  } catch (e) {
    const status = e?.status || 500;
    return res.status(status).json({ error: "Upload failed", detail: String(e?.message || e) });
  }
};

module.exports.config = {
  api: { bodyParser: false }
};
