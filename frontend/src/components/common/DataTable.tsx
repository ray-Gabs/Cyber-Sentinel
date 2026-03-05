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
      <div className="card flex items-center justify-center py-12 text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto rounded-xl border border-gray-800", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500",
                  col.className
                )}
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
              className={cn(
                "border-b border-gray-800/50 transition-colors",
                onRowClick && "cursor-pointer hover:bg-gray-800/50"
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("px-4 py-3 text-gray-300", col.className)}>
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
