import type { DataTable as DataTableType } from "@/lib/types";

interface DataTableProps {
  table: DataTableType;
}

export function DataTable({ table }: DataTableProps) {
  if (!table.headers?.length) return null;

  return (
    <div style={{ marginTop: 16, marginBottom: 16, overflowX: "auto" }}>
      {table.caption && (
        <p style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-secondary)",
          marginBottom: 8,
          textAlign: "center",
        }}>
          {table.caption}
        </p>
      )}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        <thead>
          <tr>
            {table.headers.map((header, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  borderBottom: "2px solid var(--accent)",
                  color: "var(--accent)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr
              key={ri}
              style={{
                background: ri % 2 === 0 ? "transparent" : "rgba(148, 163, 184, 0.04)",
              }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "8px 14px",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
