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
  /** Maximum number of reconnect attempts (default: 10) */
  maxRetries?: number;
  /** Maximum number of messages to keep in state (default: 100) */
  maxMessages?: number;
}

interface WebSocketMessage<T = unknown> {
  type: string;
  data: T;
}

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export function useWebSocket<T = unknown>(options: UseWebSocketOptions) {
  const {
    channel,
    autoReconnect = true,
    maxRetries = 10,
    maxMessages = 100,
  } = options;

  const [messages, setMessages] = useState<WebSocketMessage<T>[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const retryCount = useRef(0);

  const connect = useCallback(() => {
    // Build the WebSocket URL — e.g., ws://localhost:5173/ws/alerts
    const url = `${WS_BASE}/${channel}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConnected(true);
      retryCount.current = 0; // reset backoff on successful connection
      console.log(`[WS] Connected to ${channel}`);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage<T>;
        setMessages((prev) => {
          const updated = [msg, ...prev];
          // Cap the message array to avoid unbounded memory growth
          return updated.length > maxMessages ? updated.slice(0, maxMessages) : updated;
        });
      } catch {
        console.warn("[WS] Failed to parse message:", event.data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log(`[WS] Disconnected from ${channel}`);

      if (autoReconnect && retryCount.current < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s, … capped at 30s
        const delay = Math.min(BASE_DELAY_MS * 2 ** retryCount.current, MAX_DELAY_MS);
        retryCount.current += 1;
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${retryCount.current}/${maxRetries})`);
        reconnectTimer.current = setTimeout(connect, delay);
      } else if (retryCount.current >= maxRetries) {
        console.warn(`[WS] Max retries (${maxRetries}) reached for channel "${channel}". Giving up.`);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [channel, autoReconnect, maxRetries, maxMessages]);

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
