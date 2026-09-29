"use client";
import { useEffect, useRef, useState } from "react";
import type { ServerRecord } from "./panel-types";
export function usePanelSocket(onSnapshot: (servers: ServerRecord[]) => void) {
  const callback = useRef(onSnapshot); callback.current = onSnapshot;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let disposed = false; let socket: WebSocket; let retry: ReturnType<typeof setTimeout>; let attempts = 0;
    const connect = () => {
      socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/panel`);
      socket.onopen = () => { attempts = 0; setConnected(true); };
      socket.onmessage = event => {
        try { const data = JSON.parse(event.data); if (data.type === "servers" && Array.isArray(data.servers)) callback.current(data.servers); } catch { /* Ignore malformed frames. */ }
      };
      socket.onclose = event => {
        setConnected(false);
        if (!disposed && event.code !== 1008) retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts++));
        if (event.code === 1008) callback.current([]);
      };
      socket.onerror = () => socket.close();
    };
    connect(); return () => { disposed = true; clearTimeout(retry); socket.close(); };
  }, []);
  return connected;
}
