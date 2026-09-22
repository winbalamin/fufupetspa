import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleApiRequest } from "../server/routes";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathname = (req.url ?? "").split("?")[0] ?? "";
  const handled = await handleApiRequest(req, res, pathname);
  if (!handled) {
    res.status(404).json({ error: "Not found" });
  }
}
