import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApi } from "./server/api";

type ApiResponse = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

function sendJson(res: ServerResponse, status: number, payload: ApiResponse) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function convoyApiPlugin(api: ReturnType<typeof createApi>): Plugin {
  return {
    name: "convoy-api",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res) => {
        if (!req.url) {
          sendJson(res, 400, { ok: false, error: "Missing URL" });
          return;
        }
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Only POST supported" });
          return;
        }

        const [kind, name] = req.url.split("/").filter(Boolean);
        if (!kind || !name) {
          sendJson(res, 404, { ok: false, error: "Unknown endpoint" });
          return;
        }

        const body = await readBody(req);
        let args: unknown = {};
        if (body) {
          try {
            args = JSON.parse(body);
          } catch (error) {
            sendJson(res, 400, { ok: false, error: "Invalid JSON" });
            return;
          }
        }

        try {
          const data =
            kind === "mutation"
              ? await api.runMutation(name, args)
              : kind === "query"
                ? await api.runQuery(name, args)
                : undefined;
          if (data === undefined) {
            sendJson(res, 404, { ok: false, error: "Unknown endpoint" });
            return;
          }
          sendJson(res, 200, { ok: true, data });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Request failed";
          sendJson(res, 400, { ok: false, error: message });
        }
      });

      server.httpServer?.once("close", () => {
        api.close().catch(() => undefined);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  const api = createApi();

  return {
    plugins: [react(), convoyApiPlugin(api)],
  };
});
