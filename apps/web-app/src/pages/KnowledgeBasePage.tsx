import {
  listKnowledgeDocumentsPage,
  type KnowledgeDocumentStatus
} from "@/services/knowledge.api";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Filter,
  Loader2,
  ScrollText,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

const CATEGORY_OPTIONS = [
  { value: "ALL", label: "Tất cả danh mục" },
  { value: "land", label: "Đất đai" },
  { value: "construction", label: "Xây dựng" },
  { value: "environment", label: "Môi trường" },
  { value: "administrative", label: "Thủ tục hành chính" },
  { value: "urban", label: "Quy hoạch đô thị" },
];

const STATUS_OPTIONS: Array<{ value: "ALL" | KnowledgeDocumentStatus; label: string }> = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "ACTIVE", label: "Đang áp dụng" },
  { value: "INACTIVE", label: "Hết hiệu lực" },
];

function formatStatusLabel(status: KnowledgeDocumentStatus): string {
  return status === "ACTIVE" ? "Đang áp dụng" : "Hết hiệu lực";
}

function getStatusTone(status: KnowledgeDocumentStatus): string {
  return status === "ACTIVE"
    ? "bg-emerald-100 text-emerald-800"
    : "bg-amber-100 text-amber-800";
}

function formatCategoryLabel(value?: string): string {
  const key = value?.trim().toLowerCase();
  switch (key) {
    case "land":
      return "Đất đai";
    case "construction":
      return "Xây dựng";
    case "environment":
      return "Môi trường";
    case "administrative":
      return "Thủ tục hành chính";
    case "urban":
      return "Quy hoạch đô thị";
    default:
      return value || "Khác";
  }
}

function getCategoryTone(value?: string): string {
  const key = value?.trim().toLowerCase();
  switch (key) {
    case "land":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-200";
    case "construction":
      return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-200";
    case "environment":
      return "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-500/50 dark:bg-teal-500/10 dark:text-teal-200";
    case "administrative":
      return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-200";
    case "urban":
      return "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/50 dark:bg-violet-500/10 dark:text-violet-200";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200";
  }
}

function getMetaTone(tone: "source" | "updated" | "effective" | "law"): string {
  switch (tone) {
    case "source":
      return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-200";
    case "updated":
      return "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-200";
    case "effective":
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200";
    case "law":
      return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-200";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200";
  }
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleDateString("vi-VN");
}

function formatContent(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([.!?])\s+/g, "$1\n");
}

function buildExcerpt(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trim()}...`;
}

export function KnowledgeBasePage() {
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | KnowledgeDocumentStatus>("ALL");
  const [expandedIds, setExpandedIds] = useState(() => new Set<string>());

  const filters = useMemo(
    () => ({
      q: searchText.trim(),
      category: category === "ALL" ? undefined : category,
      status: status === "ALL" ? undefined : status,
    }),
    [searchText, category, status],
  );

  const query = useInfiniteQuery({
    queryKey: ["knowledge-documents", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listKnowledgeDocumentsPage({
        q: filters.q || undefined,
        category: filters.category,
        status: filters.status,
        limit: 12,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });

  const documents = useMemo(() => {
    return query.data?.pages.flatMap((page) => page.items) ?? [];
  }, [query.data]);

  const totalCount = documents.length;

  if (query.isLoading) {
    return (
      <div className="flex justify-center flex-1 items-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6 text-slate-900 dark:text-slate-100">
      <header className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Cơ sở dữ liệu Pháp luật dịch vụ công
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Tra cứu và quản lý các quy định pháp luật áp dụng toàn quốc.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Tìm kiếm quy định..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">
                Danh mục
              </span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="bg-transparent text-sm font-medium text-slate-700 outline-none dark:bg-slate-950 dark:text-slate-100"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2">
              <span className="text-xs font-semibold text-slate-500">
                Trạng thái
              </span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "ALL" | KnowledgeDocumentStatus)
                }
                className="bg-transparent text-sm font-medium text-slate-700 outline-none dark:bg-slate-950 dark:text-slate-100"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
            <ScrollText className="h-3 w-3" />
            {totalCount} văn bản
          </span>
          {filters.q ? (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700 shadow-sm dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-200">
              Từ khóa: "{filters.q}"
            </span>
          ) : null}
          {filters.category ? (
            <span
              className={`rounded-full border px-2.5 py-1 shadow-sm ${getCategoryTone(
                filters.category,
              )}`}
            >
              Danh mục: {formatCategoryLabel(filters.category)}
            </span>
          ) : null}
          {filters.status ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 shadow-sm dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
              Trạng thái: {formatStatusLabel(filters.status)}
            </span>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        {documents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 px-6 py-16 text-center text-slate-500">
            Không có văn bản phù hợp bộ lọc hiện tại.
          </div>
        ) : (
          documents.map((document) => (
            <article
              key={document.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm transition hover:shadow-md"
            >
              {(() => {
                const isExpanded = expandedIds.has(document.id);
                const rawContent = document.content ?? "";
                const displayContent = isExpanded
                  ? formatContent(rawContent)
                  : buildExcerpt(rawContent, 220);
                const canExpand = rawContent.trim().length > 220;

                return (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {document.title}
                    </h3>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusTone(document.status)}`}
                    >
                      {formatStatusLabel(document.status)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
                    {displayContent}
                  </p>
                  {canExpand ? (
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(document.id)) {
                            next.delete(document.id);
                          } else {
                            next.add(document.id);
                          }
                          return next;
                        });
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                    >
                      {isExpanded ? "Thu gọn" : "Hiển thị thêm"}
                    </button>
                  ) : null}
                </div>
              </div>
                );
              })()}

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span
                  className={`rounded-full border px-2.5 py-1 font-medium shadow-sm ${getCategoryTone(
                    document.category,
                  )}`}
                >
                  Danh mục: {formatCategoryLabel(document.category)}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 font-medium shadow-sm ${getMetaTone(
                    "source",
                  )}`}
                >
                  Nguồn: {document.source}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 font-medium shadow-sm ${getMetaTone(
                    "updated",
                  )}`}
                >
                  Cập nhật: {formatDate(document.updatedAt)}
                </span>
                {document.effectiveDate ? (
                  <span
                    className={`rounded-full border px-2.5 py-1 font-medium shadow-sm ${getMetaTone(
                      "effective",
                    )}`}
                  >
                    Hiệu lực: {formatDate(document.effectiveDate)}
                  </span>
                ) : null}
                {document.metadata?.lawName ? (
                  <span
                    className={`rounded-full border px-2.5 py-1 font-medium shadow-sm ${getMetaTone(
                      "law",
                    )}`}
                  >
                    {document.metadata.lawName}
                  </span>
                ) : null}
              </div>
            </article>
          ))
        )}

        {query.hasNextPage ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {query.isFetchingNextPage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Tải thêm
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
