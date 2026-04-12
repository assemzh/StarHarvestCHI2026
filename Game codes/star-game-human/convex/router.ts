import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// Simple endpoint for window close detection
http.route({
  path: "/api/player-disconnect",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
