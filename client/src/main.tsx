import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "react-hot-toast";
import axios from "axios";
import App from "./App";
import { AuthProvider } from "./stores/auth";
import { ScrollToTop } from "./components/ScrollToTop";
import "leaflet/dist/leaflet.css";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Retry network blips, not 4xx errors
      retry: (count, err) => count < 2 && !(axios.isAxiosError(err) && err.response && err.response.status < 500),
    },
    mutations: { retry: 0 },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ScrollToTop />
            <App />
            <Toaster position="top-center" toastOptions={{ className: "!rounded-xl !text-sm !font-medium", duration: 3500 }} />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
);
