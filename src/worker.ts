// Cloudflare Workers entrypoint. Hono apps are directly exportable as a Worker.
import { app } from "./http/app.js";

export default app;
