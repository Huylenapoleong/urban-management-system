/**
 * Categories Management Page
 */

import React, { useState, useEffect } from "react";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { Modal } from "../../components/ui/modal";
import { categoriesService, Category } from "../../services/categories.service";

const CATEGORY_ICONS: Record<string, string> = {
  Infrastructure: "🏗️", Traffic: "🚦", "Public Services": "🏛️",
  Environment: "🌿", Security: "🛡️", "Public Order": "📋",
};
const CATEGORY_COLORS = [
  "from-blue-400 to-blue-600", "from-amber-400 to-amber-600",
  "from-emerald-400 to-emerald-600", "from-purple-400 to-purple-600",
  "from-rose-400 to-rose-600", "from-sky-400 to-sky-600",
];
const catColor = (id: string) => CATEGORY_COLORS[id.charCodeAt(id.length - 1) % CATEGORY_COLORS.length];

const Field = ({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
      {error}
    </p>}
  </div>
);

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isModalOpen, setModal]     = useState(false);
  const [editing, setEditing]       = useState<Category | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState({ name: "", description: "" });
  const [formErrors, setFErrors]    = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await categoriesService.getCategories();
      if (res.success && res.data) setCategories(res.data.items);
      else setError(res.error || "Failed to load categories");
    } catch { setError("Failed to load categories"); }
    finally { setLoading(false); }
  };

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditing(null); setForm({ name: "", description: "" }); setFErrors({}); setModal(true); };
  const openEdit   = (c: Category) => { setEditing(c); setForm({ name: c.name, description: c.description || "" }); setFErrors({}); setModal(true); };
  const closeModal = () => { setModal(false); setEditing(null); setForm({ name: "", description: "" }); setFErrors({}); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    else if (form.name.trim().length < 2) e.name = "At least 2 characters";
    setFErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editing) {
        const res = await categoriesService.updateCategory(editing.id, { name: form.name.trim(), description: form.description.trim() || undefined });
        if (res.success && res.data) { setCategories(cs => cs.map(c => c.id === editing.id ? res.data! : c)); closeModal(); }
        else setError(res.error || "Update failed");
      } else {
        const res = await categoriesService.createCategory({ name: form.name.trim(), description: form.description.trim() || undefined });
        if (res.success && res.data) { setCategories(cs => [...cs, res.data!]); closeModal(); }
        else setError(res.error || "Create failed");
      }
    } catch { setError("Something went wrong"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const res = await categoriesService.deleteCategory(id);
    if (res.success) { setCategories(cs => cs.filter(c => c.id !== id)); setDeleteConfirm(null); }
    else setError(res.error || "Delete failed");
  };

  return (
    <>
      <PageMeta title="Categories" description="Manage incident categories" />
      <PageBreadCrumb pageTitle="Categories" />

      <div className="space-y-5">
        {/* header card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Incident Categories</h3>
              <p className="text-xs text-gray-400 mt-0.5">{loading ? "Loading…" : `${filtered.length} categories`}</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input type="text" placeholder="Search categories…" value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all" />
              </div>
              <button onClick={openCreate}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                Add Category
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          <div className="p-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                <p className="text-sm text-gray-400">Loading categories…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-2xl">🏷️</div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No categories found</p>
                <button onClick={openCreate} className="text-xs text-blue-600 hover:underline">+ Create your first category</button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map(cat => (
                  <div key={cat.id} className="group relative p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-white dark:hover:bg-gray-800 transition-all">
                    <div className="flex items-start gap-3">
                      {/* icon */}
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${catColor(cat.id)} flex items-center justify-center text-lg flex-shrink-0`}>
                        {CATEGORY_ICONS[cat.name] ?? "📂"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{cat.name}</h4>
                        {cat.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{cat.description}</p>
                        )}
                        <p className="text-xs text-gray-300 dark:text-gray-600 mt-2">
                          Created {new Date(cat.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                    {/* actions — show on hover */}
                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(cat)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={() => setDeleteConfirm(cat.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100 dark:border-gray-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{editing ? "Edit Category" : "New Category"}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editing ? "Update category details" : "Add a new incident category"}</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Category Name" required error={formErrors.name}>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Infrastructure"
                  className={`w-full px-3.5 py-2.5 text-sm rounded-xl border transition-all focus:outline-none focus:ring-2 ${formErrors.name ? "border-red-300 focus:ring-red-100 bg-red-50" : "border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:ring-blue-100 focus:border-blue-400"}`} />
              </Field>
              <Field label="Description" error={formErrors.description}>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Brief description of this category…" rows={3}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all resize-none" />
              </Field>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={closeModal} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-100 dark:border-gray-800">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 className="text-center font-semibold text-gray-900 dark:text-white mb-1">Delete Category</h3>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-5">
              Are you sure? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Categories;