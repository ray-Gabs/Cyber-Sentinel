/**
 * useWebSocket hook — connects to the FastAPI WebSocket for real-time updates.
 *
 * TypeScript tip: "generic" types like <T> let you reuse the same hook for different
 * message shapes. useWebSocket<Alert>("/ws/alerts") means "messages are Alert objects."
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { WS_BASE } from "@/lib/constants";

interface UseWebSocketOptions {
  /** Which channel to subscribe to (e.g., "scans", "alerts") */
  channel: string;
  /** Auto-reconnect on disconnect? (default: true) */
  autoReconnect?: boolean;
}

interface WebSocketMessage<T = unknown> {
  type: string;
  data: T;
}

export function useWebSocket<T = unknown>(options: UseWebSocketOptions) {
  const { channel, autoReconnect = true } = options;
  const [messages, setMessages] = useState<WebSocketMessage<T>[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    // Build the WebSocket URL — e.g., ws://localhost:5173/ws/alerts
    const url = `${WS_BASE}/${channel}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConnected(true);
      console.log(`[WS] Connected to ${channel}`);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage<T>;
        setMessages((prev) => [msg, ...prev]); // newest first
      } catch {
        console.warn("[WS] Failed to parse message:", event.data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log(`[WS] Disconnected from ${channel}`);
      // Auto-reconnect after 3 seconds
      if (autoReconnect) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [channel, autoReconnect]);

  useEffect(() => {
    connect();
    return () => {
      // Cleanup on unmount
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  /** Clear accumulated messages */
  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, connected, clearMessages };
}
