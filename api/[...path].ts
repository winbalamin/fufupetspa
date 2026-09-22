import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      return res.status(500).json({
        error: "Missing env vars",
        hint: "Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel Settings > Environment Variables",
        found: { url: !!url, key: !!key },
      });
    }

    const { handleApiRequest } = await import("../server/routes");
    const pathname = (req.url ?? "").split("?")[0] ?? "";
    const handled = await handleApiRequest(req, res, pathname);
    if (!handled) {
      res.status(404).json({ error: "Not found", pathname });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[vercel-api] Error:", message);
    res.status(500).json({ error: message });
  }
}
