"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { canAccessRoute } from "@/lib/access";

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const initMockData = useAppStore((s) => s.initMockData);
  const sessionUser = useAppStore((s) => s.sessionUser);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await initMockData();
      if (mounted) {
        setReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [initMockData]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const publicPath = pathname.startsWith("/login");
    if (!sessionUser && !publicPath) {
      router.replace("/login");
      return;
    }
    if (sessionUser && publicPath) {
      router.replace("/dashboard");
      return;
    }
    if (
      sessionUser &&
      !publicPath &&
      !canAccessRoute(pathname, sessionUser.role)
    ) {
      router.replace("/dashboard");
    }
  }, [ready, pathname, sessionUser, router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-600">
        Loading...
      </div>
    );
  }

  if (!sessionUser && !pathname.startsWith("/login")) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-600">
        Redirecting to login...
      </div>
    );
  }

  return <>{children}</>;
}
