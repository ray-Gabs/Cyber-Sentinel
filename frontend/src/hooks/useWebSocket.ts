/**
 * useWebSocket hook — connects to the FastAPI WebSocket for real-time updates.
 *
 * TypeScript tip: "generic" types like <T> let you reuse the same hook for different
 * message shapes. useWebSocket<Alert>("/ws/alerts") means "messages are Alert objects."
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { WS_BASE, TOKEN_KEY } from "@/lib/constants";

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
  const parseFailCount = useRef(0);
  // Guards against React StrictMode double-invocation: when the effect cleanup
  // runs, this flag prevents the onclose handler from scheduling a reconnect.
  const isUnmounted = useRef(false);

  const connect = useCallback(() => {
    if (isUnmounted.current) return;

    const token = localStorage.getItem(TOKEN_KEY);
    const url = token
      ? `${WS_BASE}/${channel}?token=${encodeURIComponent(token)}`
      : `${WS_BASE}/${channel}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      if (isUnmounted.current) { ws.close(); return; }
      setConnected(true);
      retryCount.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage<T>;
        parseFailCount.current = 0;
        setMessages((prev) => {
          const updated = [msg, ...prev];
          return updated.length > maxMessages ? updated.slice(0, maxMessages) : updated;
        });
      } catch {
        console.warn("[WS] Failed to parse message:", event.data);
        parseFailCount.current += 1;
        if (parseFailCount.current === 3) {
          window.dispatchEvent(
            new CustomEvent("cs:toast", {
              detail: {
                type: "warning",
                message: "WebSocket: repeated message parse failures — real-time updates may be degraded.",
              },
            })
          );
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Don't reconnect if the component has unmounted (StrictMode or real unmount)
      if (isUnmounted.current) return;

      if (autoReconnect && retryCount.current < maxRetries) {
        const delay = Math.min(BASE_DELAY_MS * 2 ** retryCount.current, MAX_DELAY_MS);
        retryCount.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      } else if (retryCount.current >= maxRetries) {
        console.warn(`[WS] Max retries (${maxRetries}) reached for "${channel}". Giving up.`);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [channel, autoReconnect, maxRetries, maxMessages]);

  useEffect(() => {
    isUnmounted.current = false;
    retryCount.current = 0;
    connect();

    return () => {
      isUnmounted.current = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  /** Clear accumulated messages */
  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, connected, clearMessages };
}
