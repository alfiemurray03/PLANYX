import { isSameOriginRequest } from "../../_shared/enquiries.js";
import { getNativeSession } from "../../_shared/oidc.js";

const DEFAULT_REPOSITORY = "alfiemurray03/PLANYX";
const DEFAULT_BRANCH = "main";
const MAX_FILE_BYTES = 900_000;
const BLOCKED_PATHS = [
  /^\.git(?:\/|$)/i,
  /^node_modules(?:\/|$)/i,
  /^\.env(?:\.|$)/i,
  /(?:^|\/)(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)/i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
];
const TEXT_EXTENSIONS = new Set([
  "", "txt", "md", "mdx", "json", "jsonc", "js", "jsx", "mjs", "cjs", "ts", "tsx",
  "css", "scss", "sass", "less", "html", "htm", "xml", "svg", "yml", "yaml", "toml",
  "ini", "conf", "config", "properties", "sql", "graphql", "gql", "sh", "bash", "zsh",
  "ps1", "py", "rb", "php", "java", "kt", "go", "rs", "c", "h", "cpp", "hpp",
  "cs", "vue", "svelte", "astro", "lock", "gitignore", "gitattributes", "npmrc", "editorconfig",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie",
    },
  });
}

function clean(value, max = 10000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk")
    .split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
}

function parsePermissions(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function authorise(DB, identity, env) {
  const email = clean(identity?.email, 254).toLowerCase();
  if (!email) return { authenticated: false, authorised: false };
  if (configuredAdmins(env).includes(email)) return { authenticated: true, authorised: true };
  const admin = await DB.prepare("SELECT role,status,permissions FROM admin_users WHERE lower(email)=lower(?)")
    .bind(email).first().catch(() => null);
  if (!admin || ["blocked", "closed", "disabled", "inactive", "suspended"].includes(clean(admin.status || "Active", 80).toLowerCase())) {
    return { authenticated: true, authorised: false };
  }
  if (admin.role === "Platform Owner") return { authenticated: true, authorised: true };
  const permissions = parsePermissions(admin.permissions);
  if (permissions.includes("*") || permissions.includes("manage_content") || permissions.includes("manage_pages") || permissions.includes("manage_system_settings")) {
    return { authenticated: true, authorised: true };
  }
  const permission = await DB.prepare(`SELECT permission_code FROM role_permissions
    WHERE role_name=? AND permission_code IN ('manage_content','manage_pages','manage_system_settings') LIMIT 1`)
    .bind(clean(admin.role || "Auditor", 100)).first().catch(() => null);
  return { authenticated: true, authorised: Boolean(permission) };
}

function repositorySettings(env) {
  const raw = clean(env.WEBSITE_BUILDER_REPOSITORY || DEFAULT_REPOSITORY, 180);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) throw new Error("The Website Builder repository setting is invalid.");
  const branch = clean(env.WEBSITE_BUILDER_BRANCH || DEFAULT_BRANCH, 120);
  if (!/^[A-Za-z0-9._\/-]+$/.test(branch)) throw new Error("The Website Builder branch setting is invalid.");
  const token = clean(env.GITHUB_WEBSITE_BUILDER_TOKEN || env.PLANYX_GITHUB_TOKEN || "", 600);
  return { repository: raw, branch, token, writable: Boolean(token) };
}

function safePath(value) {
  const path = clean(value, 500).replace(/^\/+/, "");
  if (!path || path.includes("..") || path.includes("\\") || /[\r\n]/.test(path)) throw new Error("Choose a valid repository file path.");
  if (BLOCKED_PATHS.some(pattern => pattern.test(path))) throw new Error("That protected or secret path cannot be opened in the Website Builder.");
  return path;
}

function extension(path) {
  const file = path.split("/").pop() || "";
  if (file.startsWith(".") && !file.slice(1).includes(".")) return file.slice(1).toLowerCase();
  const index = file.lastIndexOf(".");
  return index < 0 ? "" : file.slice(index + 1).toLowerCase();
}

function isTextPath(path) {
  return TEXT_EXTENSIONS.has(extension(path));
}

function githubHeaders(token, write = false) {
  return {
    Accept: write ? "application/vnd.github+json" : "application/vnd.github+json",
    "User-Agent": "Planyx-AI-Website-Builder",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubRequest(url, settings, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...githubHeaders(settings.token, options.method && options.method !== "GET"),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = clean(payload?.message || `GitHub returned ${response.status}.`, 500);
    throw new Error(message);
  }
  return payload;
}

function decodeBase64(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function ensureAuditTable(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY, actor_email TEXT, action TEXT, entity_type TEXT,
    entity_id TEXT, summary TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function audit(DB, identity, action, path, summary, metadata = {}) {
  await ensureAuditTable(DB);
  await DB.prepare(`INSERT INTO admin_audit_log
    (id,actor_email,action,entity_type,entity_id,summary,metadata)
    VALUES (?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), clean(identity.email, 254), action, "website_source", clean(path, 500), clean(summary, 1000), JSON.stringify(metadata)
    ).run();
}

async function tree(settings) {
  const [owner, repo] = settings.repository.split("/");
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(settings.branch)}?recursive=1`;
  const payload = await githubRequest(endpoint, settings, { method: "GET" });
  const files = (Array.isArray(payload.tree) ? payload.tree : [])
    .filter(item => item?.type === "blob" && typeof item.path === "string")
    .filter(item => !BLOCKED_PATHS.some(pattern => pattern.test(item.path)))
    .map(item => ({
      path: item.path,
      sha: item.sha,
      size: Number(item.size || 0),
      editable: isTextPath(item.path) && Number(item.size || 0) <= MAX_FILE_BYTES,
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "en-GB"));
  return { files, truncated: Boolean(payload.truncated) };
}

async function readFile(settings, path) {
  const [owner, repo] = settings.repository.split("/");
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(settings.branch)}`;
  const payload = await githubRequest(endpoint, settings, { method: "GET" });
  if (payload.type !== "file") throw new Error("That repository item is not a file.");
  const size = Number(payload.size || 0);
  if (size > MAX_FILE_BYTES) throw new Error("That file is too large for the browser code editor.");
  if (!isTextPath(path)) throw new Error("That binary file can be listed but not opened in the code editor.");
  let content = "";
  try {
    content = decodeBase64(payload.content || "");
  } catch {
    throw new Error("That file is not valid UTF-8 text and cannot be edited here.");
  }
  return { path, sha: payload.sha, size, content, htmlUrl: payload.html_url || "" };
}

async function saveFile(settings, path, content, sha, commitMessage) {
  if (!settings.writable) throw new Error("Source editing is read-only because the GitHub Website Builder token is not configured in Cloudflare.");
  if (!isTextPath(path)) throw new Error("Only text source files can be saved through the Website Builder.");
  const encoded = encodeBase64(content);
  if (encoded.length > MAX_FILE_BYTES * 1.5) throw new Error("That file is too large for the Website Builder source editor.");
  const [owner, repo] = settings.repository.split("/");
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  return githubRequest(endpoint, settings, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: clean(commitMessage || `Update ${path} from Planyx Website Builder`, 180),
      content: encoded,
      branch: settings.branch,
      ...(sha ? { sha: clean(sha, 120) } : {}),
    }),
  });
}

async function deleteFile(settings, path, sha, commitMessage) {
  if (!settings.writable) throw new Error("Source editing is read-only because the GitHub Website Builder token is not configured in Cloudflare.");
  if (!sha) throw new Error("The source file SHA is required before deletion.");
  const [owner, repo] = settings.repository.split("/");
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  return githubRequest(endpoint, settings, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: clean(commitMessage || `Delete ${path} from Planyx Website Builder`, 180),
      sha: clean(sha, 120),
      branch: settings.branch,
    }),
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const correlationId = clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120);
  if (!env.DB) return json({ success: false, error: "The Website Builder database binding is missing.", correlationId }, 500);

  try {
    const identity = await getNativeSession(request, env, "admin");
    const access = await authorise(env.DB, identity, env);
    if (!access.authenticated) return json({ success: false, error: "Your administrator session has expired. Please sign in again.", code: "SESSION_EXPIRED", correlationId }, 401);
    if (!access.authorised) return json({ success: false, error: "You do not have permission to access website source code.", code: "FORBIDDEN", correlationId }, 403);

    const settings = repositorySettings(env);
    const url = new URL(request.url);

    if (request.method === "GET") {
      const action = clean(url.searchParams.get("action") || "tree", 30);
      if (action === "tree") {
        const result = await tree(settings);
        return json({ success: true, repository: settings.repository, branch: settings.branch, writable: settings.writable, ...result, correlationId });
      }
      if (action === "file") {
        const path = safePath(url.searchParams.get("path"));
        return json({ success: true, repository: settings.repository, branch: settings.branch, writable: settings.writable, file: await readFile(settings, path), correlationId });
      }
      if (action === "status") {
        return json({ success: true, repository: settings.repository, branch: settings.branch, writable: settings.writable, correlationId });
      }
      return json({ success: false, error: "Unknown source-code action." }, 400);
    }

    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
    if (!isSameOriginRequest(request)) return json({ success: false, error: "This request could not be verified." }, 403);
    const body = await request.json().catch(() => ({}));
    const action = clean(body.action, 30);
    const path = safePath(body.path);

    if (action === "save") {
      const content = String(body.content ?? "");
      const result = await saveFile(settings, path, content, clean(body.sha, 120), clean(body.commitMessage, 180));
      const commitSha = result?.commit?.sha || "";
      await audit(env.DB, identity, "website_source_save", path, `Source file saved to ${settings.branch}: ${path}.`, { repository: settings.repository, branch: settings.branch, commit_sha: commitSha, correlation_id: correlationId });
      return json({ success: true, path, sha: result?.content?.sha || "", commitSha, htmlUrl: result?.content?.html_url || "", correlationId });
    }

    if (action === "delete") {
      const result = await deleteFile(settings, path, clean(body.sha, 120), clean(body.commitMessage, 180));
      const commitSha = result?.commit?.sha || "";
      await audit(env.DB, identity, "website_source_delete", path, `Source file deleted from ${settings.branch}: ${path}.`, { repository: settings.repository, branch: settings.branch, commit_sha: commitSha, correlation_id: correlationId });
      return json({ success: true, path, commitSha, correlationId });
    }

    return json({ success: false, error: "Unknown source-code action." }, 400);
  } catch (error) {
    console.error(JSON.stringify({ event: "website_source_request_failed", correlation_id: correlationId, error: error instanceof Error ? error.message : "Unknown error" }));
    return json({ success: false, error: error instanceof Error ? error.message : "The website source repository could not be accessed.", correlationId }, 500);
  }
}
