function origin(value: string) {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : "";
  } catch {
    return "";
  }
}

/** Resolve links without binding transactional email to one Vercel or custom domain. */
export function resolvePublicOrigin(source?: Request | string, configured = "") {
  const saved = origin(configured.trim());
  if (saved) return saved;
  const live = origin(typeof source === "string" ? source : source?.url || "");
  if (live) return live;
  for (const candidate of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ]) {
    const fallback = origin(String(candidate || "").trim());
    if (fallback) return fallback;
  }
  return "";
}
