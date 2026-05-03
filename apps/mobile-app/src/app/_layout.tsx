import FloatingAiChatbot from "@/components/shared/FloatingAiChatbot";
import colors from "@/constants/colors";
import { ApiClient } from "@/lib/api-client";
import AsyncStorageShim from "@/lib/async-storage-shim";
import { socketClient } from "@/lib/socket-client";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { queryKeys } from "@/services/query-keys";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React from "react";
import { AppState, LogBox, Platform } from "react-native";
import { MD3LightTheme, PaperProvider } from "react-native-paper";

import { WebRTCProvider } from "../providers/WebRTCProvider";

LogBox.ignoreLogs([
  "Unexpected text node",
  "Unexpected text node: .",
  "A text node cannot be a child of a <View>",
]);

void SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      retryDelay: (failureCount) =>
        Math.min(1000 * 2 ** failureCount, 10 * 1000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
  },
});

const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    secondary: colors.secondary,
    background: colors.background,
    surface: colors.card,
    surfaceVariant: colors.surface,
    primaryContainer: "rgba(10,207,254,0.14)",
    secondaryContainer: "rgba(73,90,255,0.14)",
    outline: colors.border,
    onSurface: colors.text,
    onSurfaceVariant: colors.textSecondary,
  },
};

type AsyncStorageLike = typeof AsyncStorageShim;

function getSafeAsyncStorage(): AsyncStorageLike {
  if (Platform.OS === "web") {
    return AsyncStorageShim;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("@react-native-async-storage/async-storage") as {
      default?: AsyncStorageLike;
    };

    if (module?.default) {
      return module.default;
    }
  } catch (error) {
    console.warn(
      "[RootLayout] AsyncStorage native module unavailable, falling back to in-memory shim.",
      error,
    );
  }

  return AsyncStorageShim;
}

queryClient.setQueryDefaults(["messages"], {
  staleTime: Infinity,
  gcTime: 30 * 60 * 1000,
  refetchOnMount: false,
  refetchOnReconnect: false,
});
queryClient.setQueryDefaults(["profile"], {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});
queryClient.setQueryDefaults(["reports"], {
  staleTime: 30 * 1000,
  gcTime: 10 * 60 * 1000,
});
queryClient.setQueryDefaults(["feed"], {
  staleTime: 30 * 1000,
  gcTime: 10 * 60 * 1000,
});
queryClient.setQueryDefaults(["static"], {
  staleTime: 60 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
});
queryClient.setQueryDefaults(["uploads", "avatar-library"], {
  staleTime: 60 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
});

const getPersistStorage = () => getSafeAsyncStorage();

const queryPersister = createAsyncStoragePersister({
  storage: getPersistStorage(),
  key: "rq-mobile-cache-v1",
  throttleTime: 1000,
});

const WEB_RUNTIME_GUARD_TAG = "[web-runtime-guard:mobile-app]";
const WEB_RUNTIME_GUARD_FLAG = "__umsWebRuntimeGuardInstalled__";
const SAFE_HISTORY_METHOD_FLAG = "__umsSafeHistoryMethod__";
const HISTORY_FALLBACK_IN_PROGRESS_FLAG = "__umsHistoryFallbackInProgress__";
let splashHidden = false;

async function hideSplashOnce() {
  if (splashHidden) {
    return;
  }

  splashHidden = true;
  await SplashScreen.hideAsync().catch(() => {});
}

function installWebRuntimeGuards() {
  if (
    Platform.OS !== "web" ||
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function"
  ) {
    return;
  }

  const globalWindow = window as unknown as Window & { [key: string]: unknown };
  if (globalWindow[WEB_RUNTIME_GUARD_FLAG]) {
    return;
  }
  globalWindow[WEB_RUNTIME_GUARD_FLAG] = true;

  const toMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);
  const toStack = (error: unknown): string | undefined =>
    error instanceof Error ? error.stack : undefined;

  const isHistoryDispatchError = (error: unknown): boolean => {
    const message = toMessage(error);
    return message.includes("dispatchEvent") && message.includes("null");
  };

  const isRemoveChildNotFoundError = (error: unknown): boolean => {
    const message = toMessage(error);
    return message.includes("removeChild") && message.includes("not a child");
  };

  const serializeArgs = (args: unknown[]): string => {
    try {
      return JSON.stringify(args);
    } catch {
      return "[unserializable-args]";
    }
  };

  const getHistoryTargets = () => {
    const targets: { label: string; target: any }[] = [
      { label: "window.history", target: window.history as any },
    ];

    const historyProto = (globalThis as any).History?.prototype;
    if (historyProto) {
      targets.push({ label: "History.prototype", target: historyProto });
    }

    return targets;
  };

  const toFallbackUrl = (nextUrl: unknown): string | null => {
    if (typeof nextUrl === "string") {
      return nextUrl;
    }

    if (typeof URL !== "undefined" && nextUrl instanceof URL) {
      return nextUrl.toString();
    }

    if (nextUrl && typeof nextUrl === "object") {
      const candidate = nextUrl as Record<string, unknown>;
      const nestedPath =
        candidate.pathname ??
        candidate.path ??
        candidate.as ??
        candidate.href ??
        candidate.url;

      if (typeof nestedPath === "string" && nestedPath.trim()) {
        return nestedPath;
      }
    }

    return null;
  };

  const wrapHistoryMethod = (method: "pushState" | "replaceState") => {
    for (const { label, target } of getHistoryTargets()) {
      const original = target?.[method];
      if (typeof original !== "function") {
        continue;
      }

      if ((original as any)[SAFE_HISTORY_METHOD_FLAG]) {
        continue;
      }

      const safeMethod = function (this: unknown, ...args: unknown[]) {
        try {
          return original.apply(this, args);
        } catch (error) {
          if (!isHistoryDispatchError(error)) {
            throw error;
          }

          console.error(`${WEB_RUNTIME_GUARD_TAG} matched history error`, {
            method,
            holder: label,
            href: window.location.href,
            args: serializeArgs(args),
            message: toMessage(error),
            stack: toStack(error),
          });

          const fallbackUrl = toFallbackUrl(args[2]);
          const globalWindowState = window as unknown as Window & {
            [HISTORY_FALLBACK_IN_PROGRESS_FLAG]?: boolean;
          };
          const safeFallbackUrl = fallbackUrl ?? window.location.href;

          if (globalWindowState[HISTORY_FALLBACK_IN_PROGRESS_FLAG]) {
            return undefined;
          }

          if (safeFallbackUrl) {
            globalWindowState[HISTORY_FALLBACK_IN_PROGRESS_FLAG] = true;
            console.warn(`${WEB_RUNTIME_GUARD_TAG} fallback navigation`, {
              method,
              holder: label,
              nextUrl: safeFallbackUrl,
            });

            window.setTimeout(() => {
              if (method === "pushState") {
                window.location.assign(safeFallbackUrl);
              } else {
                window.location.replace(safeFallbackUrl);
              }
            }, 0);
          }

          return undefined;
        }
      };

      (safeMethod as any)[SAFE_HISTORY_METHOD_FLAG] = true;

      try {
        Object.defineProperty(target, method, {
          configurable: true,
          writable: true,
          value: safeMethod,
        });
        console.info(`${WEB_RUNTIME_GUARD_TAG} wrapped ${method} on ${label}`);
      } catch (error) {
        try {
          target[method] = safeMethod;
          console.info(
            `${WEB_RUNTIME_GUARD_TAG} assigned ${method} on ${label}`,
          );
        } catch {
          console.warn(
            `${WEB_RUNTIME_GUARD_TAG} failed to wrap ${method} on ${label}`,
            {
              message: toMessage(error),
            },
          );
        }
      }
    }
  };

  const nodeProto = (globalThis as any).Node?.prototype;
  if (nodeProto && typeof nodeProto.removeChild === "function") {
    const originalRemoveChild = nodeProto.removeChild;

    nodeProto.removeChild = function (child: unknown) {
      if (child && (child as any).parentNode !== this) {
        console.warn(
          `${WEB_RUNTIME_GUARD_TAG} blocked removeChild for detached node`,
          {
            href: window.location.href,
          },
        );
        return child;
      }

      try {
        return originalRemoveChild.call(this, child);
      } catch (error) {
        if (!isRemoveChildNotFoundError(error)) {
          throw error;
        }

        console.error(`${WEB_RUNTIME_GUARD_TAG} matched removeChild error`, {
          href: window.location.href,
          message: toMessage(error),
          stack: toStack(error),
        });

        return child;
      }
    };

    console.info(`${WEB_RUNTIME_GUARD_TAG} wrapped Node.removeChild`);
  }

  window.addEventListener("unhandledrejection", (event) => {
    if (
      !isHistoryDispatchError(event.reason) &&
      !isRemoveChildNotFoundError(event.reason)
    ) {
      return;
    }

    event.preventDefault();

    console.error(`${WEB_RUNTIME_GUARD_TAG} unhandledrejection`, {
      href: window.location.href,
      message: toMessage(event.reason),
      stack: toStack(event.reason),
      reason: event.reason,
    });
  });

  window.addEventListener("error", (event) => {
    const error = event.error;
    if (!isHistoryDispatchError(error) && !isRemoveChildNotFoundError(error)) {
      return;
    }

    event.preventDefault();

    console.error(`${WEB_RUNTIME_GUARD_TAG} window.error`, {
      href: window.location.href,
      message: toMessage(error),
      stack: toStack(error),
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");

  let rewrapTicks = 0;
  const rewrapTimer = window.setInterval(() => {
    rewrapTicks += 1;
    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");

    if (rewrapTicks >= 20) {
      window.clearInterval(rewrapTimer);
    }
  }, 500);
}

function NavigationQueryLifecycleManager() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  // Cancel only in-flight queries that are no longer observed by the new route.
  React.useEffect(() => {
    void queryClient.cancelQueries({
      predicate: (query) => {
        const isFetching = query.state.fetchStatus === "fetching";
        const isActive =
          typeof (query as any).isActive === "function"
            ? Boolean((query as any).isActive())
            : true;

        return isFetching && !isActive;
      },
    });
  }, [pathname, queryClient]);

  return null;
}

function SocketLifecycleManager() {
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        socketClient.pause();
        return;
      }

      if (nextState === "active") {
        void socketClient.resume().catch(() => {});
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  return null;
}

function WebRuntimeSafetyManager() {
  React.useEffect(() => {
    installWebRuntimeGuards();
  }, []);

  return null;
}

function SplashPreloadManager({ queryHydrated }: { queryHydrated: boolean }) {
  const queryClient = useQueryClient();
  const { user, isLoading, logout } = useAuth();
  const userId = user?.sub ?? "";

  React.useEffect(() => {
    if (!queryHydrated || isLoading) {
      return;
    }

    let cancelled = false;

    const finishSplashPreload = async () => {
      if (!userId) {
        await hideSplashOnce();
        return;
      }

      const profileKey = queryKeys.profile();
      const cachedProfile = queryClient.getQueryData(profileKey);

      if (!cachedProfile) {
        try {
          await queryClient.prefetchQuery({
            queryKey: profileKey,
            queryFn: ({ signal }) =>
              ApiClient.get("/users/me", undefined, { signal }),
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
          });
        } catch (error: any) {
          const status = Number(error?.status ?? error?.response?.status);
          if (!cancelled && (status === 401 || status === 403)) {
            await logout();
          }
        }
      }

      if (!cancelled) {
        await hideSplashOnce();
      }
    };

    void finishSplashPreload();

    return () => {
      cancelled = true;
    };
  }, [isLoading, logout, queryClient, queryHydrated, userId]);

  return null;
}

export default function RootLayout() {
  const [queryHydrated, setQueryHydrated] = React.useState(false);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 24 * 60 * 60 * 1000,
      }}
      onSuccess={() => setQueryHydrated(true)}
    >
      <NavigationQueryLifecycleManager />
      <SocketLifecycleManager />
      <WebRuntimeSafetyManager />
      <PaperProvider theme={paperTheme}>
        <AuthProvider>
          <SplashPreloadManager queryHydrated={queryHydrated} />
          <WebRTCProvider>
            <Stack screenOptions={{ headerShown: false }} />
            <FloatingAiChatbot />
          </WebRTCProvider>
        </AuthProvider>
      </PaperProvider>
    </PersistQueryClientProvider>
  );
}
