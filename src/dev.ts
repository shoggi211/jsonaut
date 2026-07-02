// Local development entrypoint: runs the same Hono app on Node,
// with process.env standing in for Worker bindings (no KV -> in-memory storage).
import { serve } from "@hono/node-server";
import { app } from "./http/app.js";
import type { Env } from "./core/types.js";

const port = Number(process.env.PORT) || 8787;

serve(
  {
    fetch: (req) => app.fetch(req, process.env as unknown as Env),
    port,
  },
  (info) => {
    console.log(`Jsonaut dev server: http://localhost:${info.port}`);
    console.log(`  demo page     GET  /`);
    console.log(`  repair API    POST /v1/repair`);
    console.log(`  MCP endpoint  POST /mcp`);
    if (process.env.DEV_ALLOW_FREE_LLM === "true") {
      console.log("  DEV_ALLOW_FREE_LLM=true — paid tier is open (dev only!)");
    }
  }
);
