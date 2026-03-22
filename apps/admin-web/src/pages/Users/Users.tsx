/**
 * Users Management Page
 */

import React, { useState, useEffect } from "react";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { Modal } from "../../components/ui/modal";
import Select from "../../components/form/Select";
import { useI18n } from "../../i18n/I18nContext";
import { usersService, User, CreateUserRequest } from "../../services/users.service";

// ── helpers ──────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  ADMIN:           { label: "Admin",            color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  PROVINCE_OFFICER:{ label: "Province Officer", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  WARD_OFFICER:    { label: "Ward Officer",     color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  CITIZEN:         { label: "Citizen",          color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  OFFICER:         { label: "Officer",          color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
};

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  ACTIVE:      { label: "Active",      dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" },
  INACTIVE:    { label: "Inactive",    dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" },
  DEACTIVATED: { label: "Deactivated", dot: "bg-red-400",     badge: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" },
};

const getRoleConfig  = (r: string) => ROLE_CONFIG[r?.toUpperCase()]   ?? { label: r,      color: "bg-gray-100 text-gray-600" };
const getStatusConfig= (s: string) => STATUS_CONFIG[s?.toUpperCase()] ?? { label: s, dot: "bg-gray-400", badge: "bg-gray-100 text-gray-600" };

const initials = (name: string) =>
  name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

const AVATAR_COLORS = [
  "from-blue-400 to-blue-600",
  "from-purple-400 to-purple-600",
  "from-emerald-400 to-emerald-600",
  "from-rose-400 to-rose-600",
  "from-amber-400 to-amber-600",
  "from-sky-400 to-sky-600",
];
const avatarColor = (id: string) => AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];

// ── field + input components ─────────────────────────────────────────────────

const Field = ({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) => (
  <div>
    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && (
      <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        {error}
      </p>
    )}
  </div>
);

const TInput = ({ type = "text", value, onChange, placeholder, error, disabled }: {
  type?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; error?: string; disabled?: boolean;
}) => (
  <input
    type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border transition-all focus:outline-none focus:ring-2 ${
      disabled
        ? "bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed"
        : error
        ? "border-red-300 focus:ring-red-100 bg-red-50 dark:bg-red-900/10 dark:border-red-700"
        : "border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:ring-blue-100 focus:border-blue-400 dark:focus:border-blue-500"
    }`}
  />
);

// ── main component ────────────────────────────────────────────────────────────

const Users: React.FC = () => {
  const { t } = useI18n();
  const [users, setUsers]         = useState<User[]>([]);
  const [page, setPage]           = useState(1);
  const [searchTerm, setSearch]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [totalPages, setTotal]    = useState(1);
  const [isModalOpen, setModal]   = useState(false);
  const [editingUser, setEditing] = useState<User | null>(null);
  const [saving, setSaving]       = useState(false);
  const [formErrors, setFErrors]  = useState<Record<string, string>>({});

  const emptyForm = () => ({
    name: "", email: "", phone: "", password: "",
    role: "CITIZEN" as const, status: "ACTIVE" as const,
    locationCode: "VN-HCM-BQ1-P01", unit: "",
  });
  const [form, setForm] = useState(emptyForm());

  useEffect(() => { fetchUsers(page, searchTerm); }, [page]);

  const fetchUsers = async (p: number, q?: string) => {
    setLoading(true); setError(null);
    try {
      const res = await usersService.getUsers(p, 10, q);
      if (res.success && res.data) {
        setUsers(res.data.items);
        setTotal(res.data.totalPages);
      } else setError(res.error || "Failed to load users");
    } catch { setError("Failed to load users"); }
    finally { setLoading(false); }
  };

  const handleSearch = (v: string) => { setSearch(v); setPage(1); fetchUsers(1, v); };

  const handleDelete = async (id: string) => {
    if (!confirm(t("users.deleteConfirm"))) return;
    const res = await usersService.deleteUser(id);
    if (res.success) setUsers(u => u.filter(x => x.id !== id));
    else setError(res.error || "Delete failed");
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setFErrors({}); setModal(true); };
  const openEdit   = (u: User) => {
    setEditing(u);
    setForm({
      name: u.fullName, email: u.email || "", phone: u.phone || "",
      password: "", role: u.role.toUpperCase() as any,
      status: u.status.toUpperCase() as any,
      locationCode: u.locationCode || "VN-HCM-BQ1-P01", unit: u.unit || "",
    });
    setFErrors({}); setModal(true);
  };
  const closeModal = () => { setModal(false); setEditing(null); setForm(emptyForm()); setFErrors({}); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!editingUser) {
      if (!form.name.trim() || form.name.trim().length < 2) e.name = "At least 2 characters required";
      if (!form.email.trim()) e.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email address";
      if (form.phone && !/^0\d{9}$/.test(form.phone.trim())) e.phone = "10 digits starting with 0";
      if (!form.locationCode.trim()) e.locationCode = "Required";
      else if (!/^VN(-[A-Z0-9]+){1,4}$/.test(form.locationCode.trim())) e.locationCode = "Format: VN-HCM-BQ1-P01";
      if (!form.password.trim()) e.password = "Password is required";
      else if (form.password.length < 8) e.password = "Minimum 8 characters";
      if (["WARD_OFFICER","PROVINCE_OFFICER","ADMIN"].includes(form.role) && !form.unit.trim())
        e.unit = "Required for this role";
    }
    setFErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editingUser) {
        const res = await usersService.changeUserStatus(editingUser.id, form.status);
        if (res.success && res.data) { setUsers(u => u.map(x => x.id === editingUser.id ? { ...x, ...res.data } : x)); closeModal(); }
        else setError(res.error || "Update failed");
      } else {
        const res = await usersService.createUser({
          fullName: form.name, email: form.email || undefined, phone: form.phone || undefined,
          password: form.password, role: form.role, locationCode: form.locationCode, unit: form.unit || undefined,
        });
        if (res.success) { await fetchUsers(page, searchTerm); closeModal(); }
        else setError(res.error || "Create failed");
      }
    } catch { setError("Something went wrong"); }
    finally { setSaving(false); }
  };

  const totalCount  = users.length;
  const activeCount = users.filter(u => u.status?.toUpperCase() === "ACTIVE").length;

  return (
    <>
      <PageMeta title="User Management" description="Manage system users" />
      <PageBreadCrumb pageTitle="User Management" />

      <div className="space-y-5">
        {/* ── top stat strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Users",   value: totalCount,                        color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-900/10" },
            { label: "Active",        value: activeCount,                       color: "text-emerald-600",bg: "bg-emerald-50 dark:bg-emerald-900/10" },
            { label: "Officers",      value: users.filter(u => ["WARD_OFFICER","PROVINCE_OFFICER","ADMIN"].includes(u.role?.toUpperCase())).length, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/10" },
            { label: "Citizens",      value: users.filter(u => u.role?.toUpperCase() === "CITIZEN").length, color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-900/10" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-2xl border border-gray-200 dark:border-gray-800 px-4 py-3`}>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${color}`}>{loading ? "—" : value}</p>
            </div>
          ))}
        </div>

        {/* ── main table card ── */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          {/* toolbar */}
          <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">All Users</h3>
              <p className="text-xs text-gray-400 mt-0.5">{loading ? "Loading…" : `${totalCount} accounts found`}</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* search */}
              <div className="relative flex-1 sm:w-64">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={searchTerm}
                  onChange={e => handleSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
                />
              </div>
              {/* add button */}
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add User
              </button>
            </div>
          </div>

          {/* error */}
          {error && (
            <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* table */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Loading users…</p>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No users found</p>
                <p className="text-xs text-gray-400 mt-0.5">Try adjusting your search or add a new user</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Contact</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Role</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                  {users.map(user => {
                    const role   = getRoleConfig(user.role);
                    const status = getStatusConfig(user.status);
                    return (
                      <tr key={user.id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02] transition-colors group">
                        {/* User */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColor(user.id)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                              {initials(user.fullName)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-white truncate">{user.fullName}</p>
                              {user.unit && <p className="text-xs text-gray-400 truncate">{user.unit}</p>}
                            </div>
                          </div>
                        </td>
                        {/* Contact */}
                        <td className="px-5 py-3.5 hidden md:table-cell">
                          <p className="text-gray-600 dark:text-gray-300 truncate">{user.email || "—"}</p>
                          {user.phone && <p className="text-xs text-gray-400">{user.phone}</p>}
                        </td>
                        {/* Role */}
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${role.color}`}>
                            {role.label}
                          </span>
                        </td>
                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                          </span>
                        </td>
                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(user)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                              title="Edit user"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              title="Delete user"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* pagination */}
          {!loading && users.length > 0 && (
            <div className="px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal ── */}
      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col border border-gray-100 dark:border-gray-800"
            onClick={e => e.stopPropagation()}
          >
            {/* modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  {editingUser ? "Edit User" : "Add New User"}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editingUser ? "Update account status" : "Create a new system account"}
                </p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* modal body */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

              {/* CREATE */}
              {!editingUser && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Field label="Full Name" required error={formErrors.name}>
                        <TInput value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Enter full name" error={formErrors.name} />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="Email" required error={formErrors.email}>
                        <TInput type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="user@example.com" error={formErrors.email} />
                      </Field>
                    </div>
                    <Field label="Phone" error={formErrors.phone}>
                      <TInput value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="0912345678" error={formErrors.phone} />
                    </Field>
                    <Field label="Password" required error={formErrors.password}>
                      <TInput type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Min. 8 chars" error={formErrors.password} />
                    </Field>
                    <div className="col-span-2">
                      <Field label="Location Code" required error={formErrors.locationCode}>
                        <TInput value={form.locationCode} onChange={e => setForm({...form, locationCode: e.target.value})} placeholder="VN-HCM-BQ1-P01" error={formErrors.locationCode} />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="Role">
                        <Select
                          options={[
                            { value: "CITIZEN",          label: "Citizen" },
                            { value: "WARD_OFFICER",     label: "Ward Officer" },
                            { value: "PROVINCE_OFFICER", label: "Province Officer" },
                            { value: "ADMIN",            label: "Admin" },
                          ]}
                          defaultValue={form.role}
                          onChange={v => setForm({...form, role: v as any, unit: ""})}
                          placeholder="Select role"
                        />
                      </Field>
                    </div>
                    {["WARD_OFFICER","PROVINCE_OFFICER","ADMIN"].includes(form.role) && (
                      <div className="col-span-2">
                        <Field label="Unit" required error={formErrors.unit}>
                          <TInput value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} placeholder="e.g. Ward Police Unit 1" error={formErrors.unit} />
                        </Field>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* EDIT */}
              {editingUser && (
                <>
                  {/* user preview */}
                  <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColor(editingUser.id)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                      {initials(editingUser.fullName)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{editingUser.fullName}</p>
                      <p className="text-xs text-gray-400 truncate">{editingUser.email || editingUser.phone || "—"}</p>
                    </div>
                    <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${getRoleConfig(editingUser.role).color}`}>
                      {getRoleConfig(editingUser.role).label}
                    </span>
                  </div>

                  <Field label="Status" required>
                    <Select
                      options={[
                        { value: "ACTIVE",      label: "Active" },
                        { value: "INACTIVE",    label: "Inactive" },
                        { value: "DEACTIVATED", label: "Deactivated" },
                      ]}
                      defaultValue={form.status}
                      onChange={v => setForm({...form, status: v as any})}
                      placeholder="Select status"
                    />
                  </Field>
                </>
              )}
            </div>

            {/* modal footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <button onClick={closeModal} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {saving ? "Saving…" : editingUser ? "Save Changes" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default Users;