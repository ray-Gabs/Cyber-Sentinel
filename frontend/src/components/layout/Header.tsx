/**
 * Header — top bar with user info and logout button.
 */
import { useAuth } from "@/hooks/useAuth";
import { LogOut, User } from "lucide-react";

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm px-6">
      {/* Left side: page context (can be extended later) */}
      <div />

      {/* Right side: user info + logout */}
      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <User className="h-4 w-4" />
            <span>{user.username}</span>
            <span className="badge-info text-[10px] uppercase">{user.role}</span>
          </div>
        )}
        <button onClick={logout} className="btn-ghost text-sm py-1.5 px-3">
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </header>
  );
}
