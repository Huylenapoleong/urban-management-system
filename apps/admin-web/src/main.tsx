import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "swiper/swiper-bundle.css";
import "flatpickr/dist/flatpickr.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { I18nProvider } from "./i18n/I18nContext.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <I18nProvider>
          <AppWrapper>
            <App />
          </AppWrapper>
        </I18nProvider>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>,
);
