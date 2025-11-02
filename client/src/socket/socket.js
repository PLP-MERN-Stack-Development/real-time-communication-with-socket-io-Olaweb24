// socket.js - Enhanced Socket.io client setup with Task 5 infinite scroll support
import { io } from "socket.io-client";
import { useEffect, useState } from "react";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [currentRoom, setCurrentRoom] = useState("global");
  const [privateTo, setPrivateTo] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  // Simple toast fallback
  const showToast = (text) => {
    const div = document.createElement("div");
    div.textContent = text;
    Object.assign(div.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      background: "#333",
      color: "white",
      padding: "10px 16px",
      borderRadius: "8px",
      fontSize: "14px",
      zIndex: 9999,
      opacity: 0,
      transition: "opacity 0.3s",
    });
    document.body.appendChild(div);
    setTimeout(() => (div.style.opacity = 1), 50);
    setTimeout(() => {
      div.style.opacity = 0;
      setTimeout(() => div.remove(), 300);
    }, 4000);
  };

  const connect = (username) => {
    socket.connect();
    if (username) socket.emit("user_join", username);
  };

  const disconnect = () => socket.disconnect();

  const sendMessage = (message) => {
    socket.emit("send_message", { message });
  };

  const sendPrivateMessage = (to, message) => {
    socket.emit("private_message", { to, message });
  };

  const setTyping = (isTyping) => {
    socket.emit("typing", isTyping);
  };

  const joinRoom = (roomName) => {
    socket.emit("join_room", roomName);
    setCurrentRoom(roomName);
    setPrivateTo(null);
    setUnreadCounts((prev) => ({ ...prev, [roomName]: 0 }));
  };

  const selectPrivate = (user) => {
    setPrivateTo(user);
    setUnreadCounts((prev) => ({ ...prev, [user?.id]: 0 }));
  };

  const sendFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      socket.emit("send_file", {
        fileData: reader.result,
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const sendReaction = (messageId, reaction) => {
    socket.emit("react_message", { messageId, reaction });
  };

  const markAsRead = (messageId) => {
    socket.emit("read_message", messageId);
  };

  const playNotificationSound = () => {
    const audio = new Audio("/notification.mp3");
    audio.play().catch(() => {});
  };

  const showBrowserNotification = (title, body) => {
    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") new Notification(title, { body });
        else showToast(`${title}: ${body}`);
      });
    } else showToast(`${title}: ${body}`);
  };

  // --- NEW: load older messages ---
  const loadOlderMessages = ({ room, privateToId, oldestMessageId }, callback) => {
    socket.emit(
      "load_older_messages",
      { room, privateToId, oldestMessageId },
      (olderMessages) => {
        if (olderMessages && olderMessages.length > 0) {
          setMessages((prev) => [...olderMessages, ...prev]);
        }
        if (callback) callback(olderMessages);
      }
    );
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission().catch(() => {});
    }

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    const handleReceiveMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);

      const isCurrentRoom =
        (!msg.isPrivate && msg.room === currentRoom) ||
        (msg.isPrivate && privateTo?.id === msg.senderId);

      playNotificationSound();

      if (!isCurrentRoom) {
        const key = msg.isPrivate ? msg.senderId : msg.room;
        setUnreadCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));

        showBrowserNotification(
          msg.isPrivate ? `Private message from ${msg.sender}` : `New message in #${msg.room}`,
          typeof msg.message === "string" ? msg.message : JSON.stringify(msg.message)
        );
      }
    };

    const handleRoomMessages = (msgs) => setMessages(msgs);
    const handlePrivateMessage = (msg) => handleReceiveMessage(msg);
    const handleUserList = (list) => setUsers(list);

    const handleUserJoined = (user) => {
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), system: true, message: `${user.username} joined the chat`, timestamp: new Date().toISOString() },
      ]);
      playNotificationSound();
      showBrowserNotification("User joined", `${user.username} joined the chat`);
    };

    const handleUserLeft = (user) => {
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), system: true, message: `${user.username} left the chat`, timestamp: new Date().toISOString() },
      ]);
      playNotificationSound();
      showBrowserNotification("User left", `${user.username} left the chat`);
    };

    const handleTypingUsers = (list) => setTypingUsers(list);

    const handleReaction = ({ messageId, reaction }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: [...(m.reactions || []), { reaction }] } : m))
      );
    };

    const handleReadReceipt = ({ messageId, readers }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, readers } : m)));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("room_messages", handleRoomMessages);
    socket.on("private_message", handlePrivateMessage);
    socket.on("user_list", handleUserList);
    socket.on("user_joined", handleUserJoined);
    socket.on("user_left", handleUserLeft);
    socket.on("typing_users", handleTypingUsers);
    socket.on("message_reaction", handleReaction);
    socket.on("message_read", handleReadReceipt);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("room_messages", handleRoomMessages);
      socket.off("private_message", handlePrivateMessage);
      socket.off("user_list", handleUserList);
      socket.off("user_joined", handleUserJoined);
      socket.off("user_left", handleUserLeft);
      socket.off("typing_users", handleTypingUsers);
      socket.off("message_reaction", handleReaction);
      socket.off("message_read", handleReadReceipt);
    };
  }, [currentRoom, privateTo]);

  return {
    socket,
    isConnected,
    messages,
    users,
    typingUsers,
    currentRoom,
    privateTo,
    unreadCounts,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    setTyping,
    joinRoom,
    selectPrivate,
    sendFile,
    sendReaction,
    markAsRead,
    loadOlderMessages, // New method exposed
  };
};

export default socket;
