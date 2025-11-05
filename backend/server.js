import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { setupMediaStream } from "./sockets/mediaStream.js";

dotenv.config(); // Load environment variables

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: "/media-stream",
  cors: { origin: "*" },
});

// Middleware and routes here...

// Setup Media Stream (Step 2)
setupMediaStream(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
