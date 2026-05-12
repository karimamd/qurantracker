/**
 * Singleton QueryClient shared between App.tsx (Provider) and main.tsx
 * (online-event flush handler).
 *
 * networkMode: 'always' — queries/mutations fire even when navigator.onLine
 * is false, letting the Workbox service worker serve GET responses from its
 * runtime cache and letting our customFetch interceptor queue mutations.
 */
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      staleTime: 5 * 60 * 1000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
    },
    mutations: {
      networkMode: "always",
    },
  },
});
