import type { Server } from "socket.io";
let socketServer: Server | undefined;
export function attachEvents(server: Server) {
  socketServer = server;
}
export const emitGroup = (groupId: string, event: string, payload: any) =>
  socketServer?.to(`group:${groupId}`).emit(event, { ...payload, groupId });
export const emitUser = (userId: string, event: string, payload: any) =>
  socketServer?.to(`user:${userId}`).emit(event, payload);
