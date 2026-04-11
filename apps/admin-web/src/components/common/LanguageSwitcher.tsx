import React from "react";
import { useI18n } from "../../i18n/I18nContext";

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useI18n();

  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
      <button
        onClick={() => setLanguage("en")}
        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          language === "en"
            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        }`}
        aria-label="Switch to English"
        title="English"
      >
        EN
      </button>
      <button
        onClick={() => setLanguage("vi")}
        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          language === "vi"
            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        }`}
        aria-label="Switch to Vietnamese"
        title={language === "vi" ? "Tiếng Việt" : "Vietnamese"}
      >
        VI
      </button>
    </div>
  );
};
