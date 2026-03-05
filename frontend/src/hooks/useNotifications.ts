/**
 * useNotifications — manages notification state, WebSocket feed, and API calls.
 * Combines REST fetch with real-time WebSocket updates on the "notifications" channel.
 *
 * Changes: added deleteNotification, clearAll, and a 50-item cap.
 */
import { useEffect, useState, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as apiDeleteNotification,
  clearAllNotifications as apiClearAll,
} from "@/services/notificationService";
import type { Notification } from "@/types/notification";

const MAX_NOTIFICATIONS = 50;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]             = useState(true);

  const { messages } = useWebSocket<Notification>({ channel: "notifications" });

  const fetch = useCallback(async () => {
    const data = await getNotifications();
    setNotifications(data.slice(0, MAX_NOTIFICATIONS));
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => { fetch(); }, [fetch]);

  // Merge real-time WebSocket notifications — deduplicate and cap at MAX
  useEffect(() => {
    if (messages.length === 0) return;
    const newest = messages[0];
    if (newest?.type === "new_notification" && newest.data?.id) {
      const scanId = newest.data.scan_id;
      const onScanPage = !!scanId && window.location.pathname.includes(`/${scanId}`);
      const notif = onScanPage ? { ...newest.data, is_read: true } : newest.data;
      if (onScanPage) markNotificationRead(newest.data.id).catch(() => { /* ignore */ });
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        // Prepend and trim to cap
        return [notif, ...prev].slice(0, MAX_NOTIFICATIONS);
      });
    }
  }, [messages]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    await markNotificationRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await markAllNotificationsRead();
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await apiDeleteNotification(id);
  }, []);

  const clearAll = useCallback(async () => {
    setNotifications([]);
    await apiClearAll();
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    deleteNotification,
    clearAll,
    refetch: fetch,
  };
}
