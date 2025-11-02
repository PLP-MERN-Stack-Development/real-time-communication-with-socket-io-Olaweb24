// src/App.jsx
import { useState, useEffect, useRef } from "react";
import { useSocket } from "./socket/socket";
import "./App.css";

export default function App() {
  const {
    isConnected,
    messages,
    users,
    typingUsers,
    currentRoom,
    privateTo,
    unreadCounts,
    connect,
    joinRoom,
    sendMessage,
    sendPrivateMessage,
    sendFile,
    sendReaction,
    markAsRead,
    setTyping,
    selectPrivate,
  } = useSocket();

  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [joined, setJoined] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState("global");
  const [highlightedMessages, setHighlightedMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState(""); // For message search
  const [loadingOlder, setLoadingOlder] = useState(false); // For pagination
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Join chat
  const handleJoin = () => {
    if (username.trim()) {
      connect(username);
      setJoined(true);
      joinRoom("global");

      if (Notification.permission !== "granted") Notification.requestPermission();
    }
  };

  // Send message
  const handleSend = () => {
    if (message.trim()) {
      if (privateTo) sendPrivateMessage(privateTo.id, message);
      else sendMessage(message);

      setMessage("");
      setTyping(false);
    }
  };

  const handleTyping = (e) => {
    setMessage(e.target.value);
    setTyping(e.target.value.length > 0);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) sendFile(file);
  };

  const handleReaction = (id, emoji) => {
    sendReaction(id, emoji);
  };

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Infinite scroll: load older messages
  const handleScroll = () => {
    if (!chatContainerRef.current || loadingOlder) return;
    if (chatContainerRef.current.scrollTop < 50) {
      setLoadingOlder(true);
      // Emit an event to load older messages
      // Here we assume server supports `load_older_messages` with room/private info
      socket.emit(
        "load_older_messages",
        { room: selectedRoom, privateToId: privateTo?.id },
        (olderMessages) => {
          if (olderMessages && olderMessages.length > 0) {
            setMessages((prev) => [...olderMessages, ...prev]);
          }
          setLoadingOlder(false);
        }
      );
    }
  };

  // Filter messages for current room/private chat
  const displayedMessages = messages
    .filter((m) => {
      if (m.isPrivate) {
        if (!privateTo) return false;
        return m.senderId === privateTo.id || m.receiverId === privateTo.id;
      } else {
        return m.room === selectedRoom;
      }
    })
    .filter((m) => {
      if (!searchQuery) return true;
      return (
        (typeof m.message === "string" &&
          m.message.toLowerCase().includes(searchQuery.toLowerCase())) ||
        m.sender.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });

  // Select room
  const handleSelectRoom = (room) => {
    setSelectedRoom(room);
    selectPrivate(null);
    joinRoom(room);
  };

  // Select private user
  const handleSelectUser = (user) => {
    selectPrivate(user);
    setSelectedRoom(null);
  };

  // Compute total unread messages
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  // 🔔 Notifications, sound, and highlight
  useEffect(() => {
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.system || lastMsg.sender === username) return;

    const isCurrentRoom =
      (!lastMsg.isPrivate && lastMsg.room === selectedRoom) ||
      (lastMsg.isPrivate && privateTo?.id === lastMsg.senderId);

    if (!isCurrentRoom) {
      const audio = new Audio("/notification.mp3");
      audio.play().catch(() => {});

      if (Notification.permission === "granted") {
        new Notification(
          lastMsg.isPrivate
            ? `Private message from ${lastMsg.sender}`
            : `New message in #${lastMsg.room}`,
          { body: lastMsg.message }
        );
      }

      setHighlightedMessages((prev) => [...prev, lastMsg.id]);
      setTimeout(() => {
        setHighlightedMessages((prev) => prev.filter((id) => id !== lastMsg.id));
      }, 1500);
    }
  }, [messages]);

  if (!joined) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-gray-100">
        <h1 className="text-3xl font-bold text-gray-800">Join the Chat</h1>
        <input
          className="border border-gray-400 p-2 rounded w-64"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button
          onClick={handleJoin}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Join Chat
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-blue-600 text-white p-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Socket.io Chat</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm">{isConnected ? "🟢 Connected" : "🔴 Disconnected"}</span>
          {totalUnread > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded">🔔 {totalUnread}</span>
          )}
        </div>
      </header>

      <main className="flex flex-1">
        <aside className="w-1/4 bg-gray-100 p-4 border-r border-gray-300 flex flex-col">
          <h2 className="font-semibold mb-2">Online Users</h2>
          <ul className="flex-1 overflow-y-auto">
            {users.map((u) => (
              <li
                key={u.id}
                onClick={() => handleSelectUser(u)}
                className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                  privateTo?.id === u.id ? "bg-blue-200" : "hover:bg-gray-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  {u.username}
                </span>
                <span className="flex items-center gap-1">
                  {unreadCounts[u.id] > 0 && (
                    <span className="bg-red-500 text-white text-xs px-1 rounded">{unreadCounts[u.id]}</span>
                  )}
                  {privateTo?.id === u.id && <span>💬</span>}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <h3 className="font-semibold mb-1">Rooms</h3>
            <div className="flex flex-wrap gap-2">
              {["global", "tech", "fun", "random"].map((room) => (
                <button
                  key={room}
                  onClick={() => handleSelectRoom(room)}
                  className={`px-3 py-1 rounded flex items-center gap-1 ${
                    selectedRoom === room ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  #{room}
                  {unreadCounts[room] > 0 && (
                    <span className="bg-red-500 text-white text-xs px-1 rounded">{unreadCounts[room]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex-1 flex flex-col">
          <div className="p-2">
            <input
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-400 p-2 rounded"
            />
          </div>

          <div
            className="flex-1 overflow-y-auto p-4 space-y-3"
            ref={chatContainerRef}
            onScroll={handleScroll}
          >
            {loadingOlder && <div className="text-center text-gray-500">Loading older messages...</div>}
            {displayedMessages.map((m) => (
              <div
                key={`${m.id}-${m.timestamp}`} // Unique key for React
                className={`p-2 rounded ${
                  m.system
                    ? "text-gray-500 italic"
                    : `bg-gray-50 border ${highlightedMessages.includes(m.id) ? "animate-pulse border-blue-500" : ""}`
                }`}
                onClick={() => markAsRead(m.id)}
              >
                {m.system ? (
                  <em>{m.message}</em>
                ) : (
                  <>
                    <p>
                      <strong>{m.sender}</strong>{" "}
                      <span className="text-xs text-gray-400">
                        [{new Date(m.timestamp).toLocaleTimeString()}]
                      </span>
                    </p>
                    <p>{typeof m.message === "string" ? m.message : JSON.stringify(m.message)}</p>
                    {m.fileData && (
                      <a href={m.fileData} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                        📎 {m.fileName}
                      </a>
                    )}
                    {m.reactions?.length > 0 && (
                      <div className="mt-1 flex gap-1 text-sm">{m.reactions.map((r, i) => (<span key={i}>{r.reaction}</span>))}</div>
                    )}
                    <div className="flex gap-2 text-sm mt-1">
                      {["👍", "❤️", "😂", "🔥"].map((emoji) => (
                        <button key={emoji} onClick={() => handleReaction(m.id, emoji)}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                    {m.readers?.length > 0 && (
                      <p className="text-xs text-gray-400">Seen by {m.readers.join(", ")}</p>
                    )}
                    {m.room && <div className="text-xs text-gray-400 ml-2">in {m.room}</div>}
                  </>
                )}
              </div>
            ))}
            <div ref={chatEndRef}></div>
          </div>

          {typingUsers.length > 0 && (
            <div className="p-2 text-sm text-gray-500 italic">
              {typingUsers.join(", ")} {typingUsers.length > 1 ? "are" : "is"} typing...
            </div>
          )}

          <div className="p-4 border-t border-gray-300 flex gap-2 items-center">
            <input
              value={message}
              onChange={handleTyping}
              placeholder={privateTo ? `Private message to ${privateTo.username}...` : `Message #${selectedRoom}`}
              className="flex-1 border border-gray-400 p-2 rounded"
            />
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileInputRef.current.click()}
              className="bg-gray-200 px-3 py-2 rounded hover:bg-gray-300"
            >
              📎
            </button>
            <button onClick={handleSend} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              Send
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
