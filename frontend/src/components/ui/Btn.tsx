import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./Icon";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: string;
  iconRight?: string;
  loading?: boolean;
}

export function Btn({
  variant = "default",
  size = "md",
  icon,
  iconRight,
  loading,
  disabled,
  children,
  className = "",
  ...rest
}: BtnProps) {
  const variantCls =
    variant === "primary" ? "btn-primary" :
    variant === "ghost"   ? "btn-ghost"   :
    variant === "danger"  ? "btn-danger"  : "";

  const sizeCls =
    size === "sm" ? "btn-sm" :
    size === "lg" ? "btn-lg" : "";

  return (
    <button
      type="button"
      className={`btn ${variantCls} ${sizeCls} ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      {loading
        ? <Icon name="refresh" size={13} style={{ animation: "spin 1s linear infinite" }} />
        : icon && <Icon name={icon} size={14} />
      }
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={14} />}
    </button>
  );
}
