/**
 * DataTable — a reusable table component for displaying lists of data.
 *
 * TypeScript tip: This is a "generic" component. The <T> means:
 * "I don't know what shape the data will be — the caller tells me."
 *
 * Example usage:
 *   <DataTable
 *     data={scans}
 *     columns={[
 *       { key: "target", label: "Target" },
 *       { key: "status", label: "Status", render: (scan) => <StatusBadge ... /> },
 *     ]}
 *   />
 */
import { cn } from "@/lib/utils";

// A column definition tells the table how to render each column
interface Column<T> {
  key: string;                            // unique key for React
  label: string;                          // header text
  render?: (item: T) => React.ReactNode;  // custom renderer (optional)
  className?: string;                     // extra CSS class
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;  // click handler for rows
  emptyMessage?: string;           // shown when data is empty
  className?: string;
}

export default function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  onRowClick,
  emptyMessage = "No data found.",
  className,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="card flex items-center justify-center py-12" style={{ color: "var(--text-muted)" }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={cn("overflow-x-auto rounded-xl border", className)}
      style={{ borderColor: "var(--border)" }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-muted)" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn("px-4 py-3 text-left text-xs font-medium uppercase", col.className)}
                style={{ color: "var(--text-muted)" }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick?.(item)}
              className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-[var(--bg-hover)]")}
              style={{ borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)" }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn("px-4 py-3", col.className)}
                  style={{ color: "var(--text-base)" }}
                >
                  {col.render
                    ? col.render(item)
                    : String(item[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
