/**
 * Notification API service.
 * Gracefully returns empty/no-op when the backend endpoint doesn't exist yet.
 */
import api from "./api";
import type { Notification } from "@/types/notification";

/** GET /api/notifications/ — fetch notifications for current user */
export async function getNotifications(unreadOnly = false): Promise<Notification[]> {
  try {
    const res = await api.get<Notification[]>("/notifications/", {
      params: unreadOnly ? { unread_only: true } : undefined,
    });
    return res.data;
  } catch {
    return [];
  }
}

/** PATCH /api/notifications/{id}/read — mark one notification as read */
export async function markNotificationRead(id: string): Promise<void> {
  try {
    await api.patch(`/notifications/${id}/read`);
  } catch {
    // silently ignore if backend not yet available
  }
}

/** PATCH /api/notifications/read-all — mark all notifications as read */
export async function markAllNotificationsRead(): Promise<void> {
  try {
    await api.patch("/notifications/read-all");
  } catch {
    // silently ignore if backend not yet available
  }
}

/** DELETE /api/notifications/{id} — permanently delete one notification */
export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/notifications/${id}`);
}

/** DELETE /api/notifications/ — delete all notifications for current user */
export async function clearAllNotifications(): Promise<void> {
  await api.delete("/notifications/");
}
