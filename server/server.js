// server.js — Socket.io Chat Server (Advanced Features)

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const users = {}; // { socketId: { username, room } }
const rooms = {}; // { roomName: [messages] }
const typingUsers = {}; // { socketId: username }

// Utility: create message object
const createMessage = (data) => ({
  id: Date.now(),
  sender: data.sender,
  senderId: data.senderId,
  message: data.message || "",
  timestamp: new Date().toISOString(),
  room: data.room || "global",
  isPrivate: !!data.isPrivate,
  fileData: data.fileData || null,
  fileName: data.fileName || null,
  reactions: [],
  readers: [],
});

io.on("connection", (socket) => {
  console.log(`🟢 User connected: ${socket.id}`);

  // --- USER JOIN ---
  socket.on("user_join", (username) => {
    users[socket.id] = { username, id: socket.id, room: "global" };
    socket.join("global");
    io.emit("user_list", Object.values(users));
    io.emit("user_joined", { username, id: socket.id });
    console.log(`${username} joined the chat`);
  });

  // --- ROOM JOIN ---
  socket.on("join_room", (roomName) => {
    const user = users[socket.id];
    if (!user) return;

    // Leave previous room
    if (user.room) {
      socket.leave(user.room);
    }

    user.room = roomName;
    socket.join(roomName);

    // Send messages for this room
    if (!rooms[roomName]) rooms[roomName] = [];
    io.to(socket.id).emit("room_messages", rooms[roomName]);

    // Update room user list
    const roomUsers = Object.values(users).filter((u) => u.room === roomName);
    io.to(roomName).emit("room_users", roomUsers);

    console.log(`${user.username} joined room ${roomName}`);
  });

  // --- SEND MESSAGE ---
  socket.on("send_message", (message) => {
    const user = users[socket.id];
    if (!user) return;

    const msgData = createMessage({
      sender: user.username,
      senderId: socket.id,
      message,
      room: user.room,
    });

    rooms[user.room] = rooms[user.room] || [];
    rooms[user.room].push(msgData);

    io.to(user.room).emit("receive_message", msgData);
  });

  // --- PRIVATE MESSAGE ---
  socket.on("private_message", ({ to, message }) => {
    const user = users[socket.id];
    if (!user) return;

    const msgData = createMessage({
      sender: user.username,
      senderId: socket.id,
      message,
      isPrivate: true,
    });

    socket.to(to).emit("private_message", msgData);
    socket.emit("private_message", msgData);
  });

  // --- FILE OR IMAGE UPLOAD ---
  socket.on("send_file", ({ fileName, fileData }) => {
    const user = users[socket.id];
    if (!user) return;

    const fileMsg = createMessage({
      sender: user.username,
      senderId: socket.id,
      fileName,
      fileData,
      room: user.room,
    });

    rooms[user.room] = rooms[user.room] || [];
    rooms[user.room].push(fileMsg);

    io.to(user.room).emit("receive_message", fileMsg);
  });

  // --- TYPING INDICATOR ---
  socket.on("typing", (isTyping) => {
    if (users[socket.id]) {
      const username = users[socket.id].username;
      if (isTyping) typingUsers[socket.id] = username;
      else delete typingUsers[socket.id];
      io.emit("typing_users", Object.values(typingUsers));
    }
  });

  // --- MESSAGE REACTION ---
  socket.on("react_message", ({ messageId, reaction }) => {
    for (const room in rooms) {
      const msg = rooms[room].find((m) => m.id === messageId);
      if (msg) {
        msg.reactions.push({ userId: socket.id, reaction });
        io.to(room).emit("message_reaction", { messageId, reaction });
        break;
      }
    }
  });

  // --- READ RECEIPTS ---
  socket.on("read_message", (messageId) => {
    const user = users[socket.id];
    if (!user) return;

    for (const room in rooms) {
      const msg = rooms[room].find((m) => m.id === messageId);
      if (msg && !msg.readers.includes(user.username)) {
        msg.readers.push(user.username);
        io.to(room).emit("message_read", {
          messageId,
          readers: msg.readers,
        });
      }
    }
  });

  // --- DISCONNECT ---
  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      io.emit("user_left", { username: user.username, id: socket.id });
      delete users[socket.id];
      delete typingUsers[socket.id];
      io.emit("user_list", Object.values(users));
      io.emit("typing_users", Object.values(typingUsers));
      console.log(`🔴 ${user.username} disconnected`);
    }
  });
});

// API routes
app.get("/api/users", (req, res) => res.json(Object.values(users)));
app.get("/api/rooms", (req, res) => res.json(rooms));

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = { app, server, io };
