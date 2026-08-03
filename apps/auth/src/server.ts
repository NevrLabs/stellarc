import { chmodSync, rmSync } from "node:fs";
import { auth, database } from "./auth";
import { socketPath } from "./paths";

async function compatibility(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/stellarc/bootstrap") {
    const usersExist = (database.query("SELECT COUNT(*) AS count FROM user").get() as { count: number }).count > 0;
    return Response.json({ usersExist });
  }
  if (path === "/stellarc/session") {
    const session = await auth.api.getSession({ headers: request.headers });
    return session ? Response.json({ user: session.user }) : new Response(null, { status: 401 });
  }
  if (request.method !== "POST") return null;
  if (path === "/stellarc/logout") return auth.api.signOut({ headers: request.headers, asResponse: true });
  if (path !== "/stellarc/register" && path !== "/stellarc/login") return null;
  const body = await request.json() as { username?: string; password?: string };
  if (!body.username || !body.password) return new Response("username and password are required", { status: 400 });
  const email = `${body.username.toLowerCase()}@local.stellarc`;
  if (path.endsWith("register")) {
    const usersExist = (database.query("SELECT COUNT(*) AS count FROM user").get() as { count: number }).count > 0;
    if (usersExist) return new Response("this installation already has an account", { status: 409 });
  }
  return path.endsWith("register")
    ? auth.api.signUpEmail({ body: { email, password: body.password, name: body.username, username: body.username }, headers: request.headers, asResponse: true })
    : auth.api.signInEmail({ body: { email, password: body.password }, headers: request.headers, asResponse: true });
}

if (import.meta.main) {
  const socket = socketPath(process.env.STELLARC_HOME ?? "");
  rmSync(socket, { force: true });
  Bun.serve({ unix: socket, async fetch(request) {
    if (new URL(request.url).pathname === "/health") return Response.json({ status: "ok" });
    return await compatibility(request) ?? auth.handler(request);
  }});
  chmodSync(socket, 0o600);
  console.log(`stellarc-auth listening on ${socket}`);
}
