/**
 * Category tree management (ADMIN edits; SUPPORT read-only).
 * Deleting a category that has listings deactivates it instead.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronRight, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Badge, Button, Input, Modal, Select, Textarea, Toggle } from "@/components/ui";
import { AdminOnly, ErrorPanel, Mono, PageHeader, ReadOnlyNotice } from "@/components/admin/AdminUi";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useAdminMutation } from "@/components/admin/hooks";
import type { AdminCategory } from "@/components/admin/types";

type Form = { name: string; slug: string; parentId: string; icon: string; description: string; sortOrder: string; isActive: boolean };
const EMPTY: Form = { name: "", slug: "", parentId: "", icon: "", description: "", sortOrder: "0", isActive: true };
const INVALIDATE = [["admin", "categories"], ["categories"]];

export default function AdminCategoriesPage() {
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const q = useQuery({ queryKey: ["admin", "categories"], queryFn: async () => (await api.get<{ categories: AdminCategory[] }>("/admin/categories")).data.categories });

  const tree = useMemo(() => {
    const all = q.data ?? [];
    const byParent = new Map<string | null, AdminCategory[]>();
    for (const c of all) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
    const sort = (a: AdminCategory, b: AdminCategory) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    const ids = new Set(all.map((c) => c.id));
    // Orphans (parent missing) are shown at the top level so they stay editable
    const roots = all.filter((c) => !c.parentId || !ids.has(c.parentId)).sort(sort);
    return roots.map((r) => ({ ...r, children: (byParent.get(r.id) ?? []).sort(sort) }));
  }, [q.data]);

  const save = useAdminMutation<{ id: string | null; body: Record<string, unknown> }>({
    fn: ({ id, body }) => (id ? api.patch(`/admin/categories/${id}`, body) : api.post("/admin/categories", body)),
    invalidate: INVALIDATE,
    success: (_d, v) => (v.id ? "Category updated" : "Category created"),
    onSuccess: () => setEditing(null),
  });
  const toggle = useAdminMutation<{ id: string; isActive: boolean }>({
    fn: ({ id, isActive }) => api.patch(`/admin/categories/${id}`, { isActive }),
    invalidate: INVALIDATE,
    success: (_d, v) => (v.isActive ? "Category activated" : "Category hidden"),
  });
  const del = useAdminMutation<string, { ok: boolean; deactivated: boolean }>({
    fn: async (id) => (await api.delete(`/admin/categories/${id}`)).data,
    invalidate: INVALIDATE,
    success: (d) => (d.deactivated ? "Category has listings — it was deactivated instead of deleted" : "Category deleted"),
    onSuccess: () => setDeleting(null),
  });

  const openEdit = (c: AdminCategory) =>
    setEditing({ id: c.id, form: { name: c.name, slug: c.slug, parentId: c.parentId ?? "", icon: c.icon ?? "", description: c.description ?? "", sortOrder: String(c.sortOrder), isActive: c.isActive } });

  const submit = () => {
    if (!editing) return;
    const f = editing.form;
    save.mutate({
      id: editing.id,
      body: {
        name: f.name.trim(),
        ...(f.slug.trim() ? { slug: f.slug.trim() } : {}),
        parentId: f.parentId || null,
        ...(f.icon.trim() ? { icon: f.icon.trim() } : {}),
        ...(f.description.trim() ? { description: f.description.trim() } : {}),
        sortOrder: Number(f.sortOrder) || 0,
        isActive: f.isActive,
      },
    });
  };

  const Row = ({ c, depth, childCount }: { c: AdminCategory; depth: number; childCount?: number }) => (
    <div className={clsx("flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-sm", depth === 0 ? "bg-white" : "bg-slate-50/50", !c.isActive && "opacity-60")}>
      <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: depth * 28 }}>
        {depth === 0 && childCount ? (
          <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label={collapsed.has(c.id) ? "Expand" : "Collapse"} aria-expanded={!collapsed.has(c.id)}>
            <ChevronRight className={clsx("h-4 w-4 transition", !collapsed.has(c.id) && "rotate-90")} />
          </button>
        ) : (
          <span className="w-5" />
        )}
        {c.icon && <span className="text-xs text-slate-400">{c.icon}</span>}
        <span className={clsx("truncate", depth === 0 ? "font-semibold text-slate-900" : "text-slate-800")}>{c.name}</span>
        <Mono className="hidden text-slate-400 sm:inline">/{c.slug}</Mono>
        {!c.isActive && <Badge>hidden</Badge>}
      </div>
      <span className="w-20 text-right text-xs tabular-nums text-slate-500">{c._count.listings} listing{c._count.listings === 1 ? "" : "s"}</span>
      <span className="hidden w-12 text-right text-xs text-slate-400 sm:block">#{c.sortOrder}</span>
      <div className="flex items-center gap-1">
        <AdminOnly hide>
          <Toggle label={<span className="sr-only">Active</span>} checked={c.isActive} onChange={(v) => toggle.mutate({ id: c.id, isActive: v })} />
        </AdminOnly>
        <AdminOnly hide>
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        </AdminOnly>
        <AdminOnly hide>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-red-600" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </AdminOnly>
      </div>
    </div>
  );

  const parents = tree.filter((c) => c.id !== editing?.id);

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle={q.data ? `${tree.length} top-level · ${q.data.length - tree.length} subcategories` : "Browse taxonomy"}
        actions={
          <AdminOnly>
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: null, form: EMPTY })}>
              New category
            </Button>
          </AdminOnly>
        }
      />
      {!isAdmin && <ReadOnlyNotice />}
      {q.isError ? (
        <ErrorPanel message={apiError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span className="flex-1">Name</span>
            <span className="w-20 text-right">Usage</span>
            <span className="hidden w-12 text-right sm:block">Order</span>
            <span className={isAdmin ? "w-[148px]" : "w-0"} />
          </div>
          {q.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-8" />)}</div>
          ) : tree.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center text-sm text-slate-500"><FolderTree className="mb-2 h-6 w-6" />No categories yet.</div>
          ) : (
            tree.map((root) => (
              <div key={root.id}>
                <Row c={root} depth={0} childCount={root.children.length} />
                {!collapsed.has(root.id) && root.children.map((ch) => <Row key={ch.id} c={ch} depth={1} />)}
              </div>
            ))
          )}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit category" : "New category"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={save.isPending} disabled={!editing || editing.form.name.trim().length < 2} onClick={submit}>
              {editing?.id ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" name="cat-name" value={editing.form.name} maxLength={60} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })} autoFocus />
            <Input label="Slug" name="cat-slug" value={editing.form.slug} maxLength={60} placeholder="auto from name" onChange={(e) => setEditing({ ...editing, form: { ...editing.form, slug: e.target.value } })} hint="Used in SEO URLs — changing it breaks old links" />
            <Select label="Parent" name="cat-parent" value={editing.form.parentId} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, parentId: e.target.value } })}>
              <option value="">— Top level —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Input label="Icon" name="cat-icon" value={editing.form.icon} maxLength={40} placeholder="lucide icon name, e.g. camera" onChange={(e) => setEditing({ ...editing, form: { ...editing.form, icon: e.target.value } })} />
            <Input label="Sort order" name="cat-sort" type="number" value={editing.form.sortOrder} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, sortOrder: e.target.value } })} />
            <div className="flex items-end pb-2">
              <Toggle label="Active" description="Visible to users" checked={editing.form.isActive} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, isActive: v } })} />
            </div>
            <Textarea className="sm:col-span-2" label="Description" name="cat-desc" value={editing.form.description} maxLength={300} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, description: e.target.value } })} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description={deleting && deleting._count.listings > 0 ? <>This category has <b>{deleting._count.listings}</b> listing(s), so it will be <b>deactivated</b> (hidden) instead of deleted.</> : "This permanently deletes the category. Subcategories become top-level."}
        confirmLabel={deleting && deleting._count.listings > 0 ? "Deactivate" : "Delete"}
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}
