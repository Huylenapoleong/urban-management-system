export const REPORT_STATUS_LABELS: Record<string, string> = {
  NEW: "Moi tiep nhan",
  IN_PROGRESS: "Dang xu ly",
  RESOLVED: "Da giai quyet",
  REJECTED: "Tu choi",
  CLOSED: "Da dong",
};

const HANDLED_REPORT_STATUSES = new Set(["RESOLVED", "REJECTED", "CLOSED"]);

export function isHandledReportStatus(status: string) {
  return HANDLED_REPORT_STATUSES.has(status);
}

export function getReportProcessingLabel(status: string) {
  return isHandledReportStatus(status) ? "Da xu ly" : "Chua xu ly";
}

export function getReportProcessingColor(status: string) {
  return isHandledReportStatus(status) ? "#15803d" : "#d97706";
}

export function formatReportDateTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
