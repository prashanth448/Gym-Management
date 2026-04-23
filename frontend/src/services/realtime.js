import { io } from "socket.io-client";
import { getStoredToken } from "./auth";

function getRealtimeBaseUrl() {
  if (process.env.REACT_APP_REALTIME_URL) {
    return process.env.REACT_APP_REALTIME_URL;
  }

  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL.replace(/\/api\/?$/, "");
  }

  return process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : window.location.origin;
}

let socket = null;

function getSocket() {
  const token = getStoredToken();

  if (!token) {
    return null;
  }

  if (!socket) {
    socket = io(getRealtimeBaseUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
      autoConnect: true
    });

    return socket;
  }

  if (socket.auth?.token !== token) {
    socket.auth = { token };

    if (socket.connected) {
      socket.disconnect();
    }

    socket.connect();
  }

  return socket;
}

export function subscribeToRealtime(events, handler) {
  const activeSocket = getSocket();

  if (!activeSocket) {
    return () => {};
  }

  const eventList = Array.isArray(events) ? events : [events];

  eventList.forEach((eventName) => activeSocket.on(eventName, handler));

  if (!activeSocket.connected) {
    activeSocket.connect();
  }

  return () => {
    eventList.forEach((eventName) => activeSocket.off(eventName, handler));
  };
}

export function disconnectRealtime() {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
}
