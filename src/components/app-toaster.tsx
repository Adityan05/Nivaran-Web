"use client";

import { Toaster } from "react-hot-toast";

export default function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4200,
        style: {
          borderRadius: "12px",
          background: "#0f172a",
          color: "#f8fafc",
          border: "1px solid rgba(148,163,184,0.35)",
          boxShadow: "0 10px 24px rgba(2,6,23,0.32)",
        },
        success: {
          iconTheme: {
            primary: "#22c55e",
            secondary: "#ecfeff",
          },
        },
      }}
    />
  );
}
