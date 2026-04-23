const primary = "#0acffe";
const secondary = "#495aff";

export default {
  primary,
  secondary,
  gradient: {
    primary: [primary, secondary] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  background: "#f8fafc",
  backgroundDark: "#0f172a",
  card: "#ffffff",
  surface: "#f1f5f9",
  text: "#0f172a",
  textSecondary: "#64748b",
  border: "#e2e8f0",
  danger: "#f43f5e",
  success: "#10b981",
  muted: "#94a3b8",
  shadow: "rgba(15, 23, 42, 0.14)",
};
