import type { Key, ReactNode } from "react";

type MobileVisibility = "primary" | "meta" | "hidden";

export interface ResponsiveTableColumn<Row> {
  id: string;
  header: string;
  accessor: (row: Row) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  mobile?: MobileVisibility;
  mobileLabel?: string;
  mobileAccessor?: (row: Row) => ReactNode;
}

interface ResponsiveTableProps<Row> {
  columns: ResponsiveTableColumn<Row>[];
  rows: Row[];
  getRowKey?: (row: Row, index: number) => Key;
  emptyState?: ReactNode;
  className?: string;
  mobileCardClassName?: string;
}

export function ResponsiveTable<Row>({
  columns,
  rows,
  getRowKey,
  emptyState,
  className,
  mobileCardClassName,
}: ResponsiveTableProps<Row>) {
  const desktopTable = (
    <div className="hidden md:block">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className={`px-4 py-2 text-left font-medium text-slate-600 ${column.headerClassName ?? ""}`.trim()}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)} className="px-4 py-10 text-center text-sm text-slate-500">
                {emptyState ?? "暂无数据"}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const key = getRowKey ? getRowKey(row, index) : index;
              return (
                <tr key={key}>
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={`px-4 py-3 align-top text-slate-700 ${column.cellClassName ?? ""}`.trim()}
                    >
                      {column.accessor(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  const mobileCards = (
    <div className="space-y-3 md:hidden">
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          {emptyState ?? "暂无数据"}
        </div>
      ) : (
        rows.map((row, index) => {
          const key = getRowKey ? getRowKey(row, index) : index;
          return (
            <MobileRow
              key={key}
              row={row}
              columns={columns}
              cardClassName={mobileCardClassName}
            />
          );
        })
      )}
    </div>
  );

  if (className) {
    return (
      <div className={className}>
        {desktopTable}
        {mobileCards}
      </div>
    );
  }

  return (
    <div>
      {desktopTable}
      {mobileCards}
    </div>
  );
}

interface MobileRowProps<Row> {
  row: Row;
  columns: ResponsiveTableColumn<Row>[];
  cardClassName?: string;
}

function MobileRow<Row>({ row, columns, cardClassName }: MobileRowProps<Row>) {
  if (columns.length === 0) {
    return null;
  }

  const hasExplicitPrimary = columns.some((column) => column.mobile === "primary");
  const primaryColumns = hasExplicitPrimary ? columns.filter((column) => column.mobile === "primary") : [columns[0]];
  const primaryIds = new Set(primaryColumns.map((column) => column.id));

  const metaColumns = columns.filter((column) => {
    const visibility: MobileVisibility = column.mobile ?? "meta";
    if (visibility === "hidden") return false;
    if (primaryIds.has(column.id)) return false;
    return true;
  });

  const hiddenColumns = columns.filter((column) => (column.mobile ?? "meta") === "hidden");

  const cardClasses = cardClassName
    ? `rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${cardClassName}`
    : "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";

  return (
    <article className={cardClasses}>
      <div className="space-y-2">
        {primaryColumns.map((column) => (
          <div key={column.id} className="text-sm text-slate-900">
            {renderMobileValue(column, row)}
          </div>
        ))}
      </div>

      {metaColumns.length > 0 ? (
        <dl className="mt-3 space-y-2 text-sm text-slate-600">
          {metaColumns.map((column) => (
            <div key={column.id} className="flex flex-col">
              <dt className="text-xs uppercase tracking-wide text-slate-400">{column.mobileLabel ?? column.header}</dt>
              <dd className="mt-1 text-slate-700">{renderMobileValue(column, row)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {hiddenColumns.length > 0 ? (
        <details className="mt-3 rounded border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">展开更多</summary>
          <dl className="mt-2 space-y-2 text-sm">
            {hiddenColumns.map((column) => (
              <div key={column.id} className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-slate-400">{column.mobileLabel ?? column.header}</dt>
                <dd className="mt-1 text-slate-700">{renderMobileValue(column, row)}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </article>
  );
}

function renderMobileValue<Row>(column: ResponsiveTableColumn<Row>, row: Row) {
  return column.mobileAccessor ? column.mobileAccessor(row) : column.accessor(row);
}
