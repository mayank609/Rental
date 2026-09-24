/**
 * CSV helpers:
 * - CsvExportButton: client-side export of rows already on screen
 * - ServerExportButton: downloads GET /admin/export/:entity as a blob
 */
import { useState } from "react";
import toast from "react-hot-toast";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";
import { api, apiError } from "@/lib/api";

function escapeCell(v: unknown) {
  if (v == null) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(","))].join("\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CsvExportButton({ rows, filename, label = "Export CSV", disabled }: { rows: Record<string, unknown>[]; filename: string; label?: string; disabled?: boolean }) {
  return (
    <Button
      variant="outline"
      size="sm"
      icon={<Download className="h-4 w-4" />}
      disabled={disabled || rows.length === 0}
      onClick={() => downloadBlob(new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" }), filename)}
    >
      {label}
    </Button>
  );
}

export function ServerExportButton({ entity, from, to, label, disabled }: { entity: string; from?: string; to?: string; label?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.get<Blob>(`/admin/export/${entity}`, { params: { from: from || undefined, to: to || undefined }, responseType: "blob" });
      downloadBlob(r.data, `${entity}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      // Blob error bodies need parsing before apiError() can read them
      let msg = apiError(e, "Export failed");
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (data instanceof Blob) {
        try {
          msg = (JSON.parse(await data.text()) as { error?: { message?: string } }).error?.message ?? msg;
        } catch {
          /* keep generic message */
        }
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} loading={busy} disabled={disabled} onClick={run}>
      {label ?? entity.charAt(0).toUpperCase() + entity.slice(1)}
    </Button>
  );
}
