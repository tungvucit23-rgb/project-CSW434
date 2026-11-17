import { createServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import { app, validateCommentTarget } from "./app.js";
import { config } from "./config.js";
import { db, one } from "./db.js";
import { seed } from "./seed.js";
import { membership, tokenUser } from "./auth.js";
import { attachEvents } from "./events.js";
import { startWorker } from "./services.js";

await db.migrate();
await seed();
const http = createServer(app);
const io = new Server(http, {
  cors: { origin: config.corsOrigins },
  maxHttpBufferSize: 16384,
});
attachEvents(io);
io.use(async (socket, next) => {
  try {
    const uid = tokenUser(String(socket.handshake.auth?.token || ""));
    if (!(await one("SELECT id FROM users WHERE id=$1", [uid])))
      throw new Error();
    socket.data.userId = uid;
    next();
  } catch {
    next(new Error("Phiên đăng nhập không hợp lệ."));
  }
});
io.on("connection", (socket) => {
  const uid = socket.data.userId as string;
  void socket.join(`user:${uid}`);
  let typingLast = 0;
  socket.on("group:join", async (payload, ack) => {
    try {
      const { groupId } = z
        .object({ groupId: z.string().min(1).max(100) })
        .parse(payload);
      await membership(groupId, uid);
      await socket.join(`group:${groupId}`);
      if (typeof ack === "function") ack({ ok: true });
    } catch {
      if (typeof ack === "function")
        ack({
          ok: false,
          error: "Bạn không thuộc nhóm hoặc dữ liệu không hợp lệ.",
        });
    }
  });
  socket.on("group:leave", (payload) => {
    if (typeof payload?.groupId === "string")
      void socket.leave(`group:${payload.groupId}`);
  });
  socket.on("comment:typing", async (payload) => {
    if (Date.now() - typingLast < 500) return;
    typingLast = Date.now();
    try {
      const body = z
        .object({
          groupId: z.string(),
          placeId: z.string().optional(),
          planId: z.string().optional(),
          typing: z.boolean(),
        })
        .parse(payload);
      await validateCommentTarget(body.groupId, uid, body);
      if (!socket.rooms.has(`group:${body.groupId}`)) return;
      const user = await one<any>("SELECT name FROM users WHERE id=$1", [uid]);
      socket
        .to(`group:${body.groupId}`)
        .emit("comment:typing", {
          ...body,
          userId: uid,
          userName: user.name,
          expiresAt: new Date(Date.now() + 4000).toISOString(),
        });
    } catch {
      /* Invalid typing requests are ignored; no room information is disclosed. */
    }
  });
});
const stopWorker = startWorker();
http.listen(config.port, config.host, () =>
  console.log(
    `Đi Chung API listening on http://localhost:${config.port} (${db.kind}; demo=${config.allowDemo}; LLM=${config.openaiKey ? "configured" : "RULE_BASED fallback"})`,
  ),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  stopWorker();
  io.close();
  http.close();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
