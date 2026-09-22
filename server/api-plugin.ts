import type { Plugin } from "vite";
import { handleApiRequest } from "./routes";

export function sqliteApiPlugin(): Plugin {
  const attachApi = (middlewares: { use: (fn: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: (err?: Error) => void) => void) => void }) => {
    middlewares.use((req, res, next) => {
      const pathname = (req.url ?? "").split("?")[0] ?? "";
      if (!pathname.startsWith("/api/")) return next();

      void handleApiRequest(req, res, pathname).then((handled) => {
        if (!handled) next();
      });
    });
  };

  return {
    name: "fufu-petspa-sqlite-api",
    configureServer(server) {
      attachApi(server.middlewares);
    },
    configurePreviewServer(server) {
      attachApi(server.middlewares);
    },
  };
}
