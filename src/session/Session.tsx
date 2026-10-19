import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { createClientId } from "@/session/createClientId";
import { rememberIdentity } from "@/session/currentIdentity";
import { loadStoredIdentity, storeIdentity } from "@/session/deviceStorage";
import { announcePresence } from "@/session/presence";

interface Session {
  clientId: string;
  name: string;
  ready: boolean;
  enter: (name: string) => void;
  rename: (name: string) => void;
}

const SessionContext = createContext<Session | null>(null);

function initialSession() {
  if (typeof window === "undefined") {
    return { ready: false, clientId: "", name: "" };
  }
  const stored = loadStoredIdentity();
  if (stored) {
    rememberIdentity({ clientId: stored.clientId, displayName: stored.displayName });
    return { ready: true, clientId: stored.clientId, name: stored.displayName };
  }
  return { ready: true, clientId: createClientId(), name: "" };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(initialSession);

  useEffect(() => {
    if (session.ready) {
      return;
    }
    const stored = loadStoredIdentity();
    if (stored) {
      setSession({ ready: true, clientId: stored.clientId, name: stored.displayName });
      return;
    }
    setSession({ ready: true, clientId: createClientId(), name: "" });
  }, [session.ready]);

  useEffect(() => {
    if (!session.ready || !session.clientId) {
      return;
    }
    rememberIdentity({ clientId: session.clientId, displayName: session.name });
  }, [session]);

  function enter(nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed || !session.clientId) {
      return;
    }
    storeIdentity({ clientId: session.clientId, displayName: trimmed });
    rememberIdentity({ clientId: session.clientId, displayName: trimmed });
    setSession({ ready: true, clientId: session.clientId, name: trimmed });
    announcePresence(trimmed);
  }

  function rename(nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed || !session.clientId || trimmed === session.name) {
      return;
    }
    storeIdentity({ clientId: session.clientId, displayName: trimmed });
    rememberIdentity({ clientId: session.clientId, displayName: trimmed });
    setSession({ ready: true, clientId: session.clientId, name: trimmed });
    announcePresence(trimmed);
  }

  return (
    <SessionContext.Provider
      value={{
        clientId: session.clientId,
        name: session.name,
        ready: session.ready,
        enter,
        rename,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return session;
}
