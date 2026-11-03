import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { createClientId } from "@/session/createClientId";
import { rememberIdentity } from "@/session/currentIdentity";
import { loadDeviceCredential, loadStoredIdentity, storeIdentity } from "@/session/deviceStorage";
import { announcePresence } from "@/session/presence";
import { cleanProfile, type ProfileInput } from "@/session/profile";

interface Session {
  clientId: string;
  name: string;
  title: string;
  location: string;
  photoUri: string;
  ready: boolean;
  enter: (profile: ProfileInput) => void;
  updateProfile: (profile: ProfileInput) => void;
  rename: (name: string) => void;
}

const SessionContext = createContext<Session | null>(null);

function initialSession() {
  if (typeof window === "undefined") {
    return { ready: false, clientId: "", name: "", title: "", location: "", photoUri: "" };
  }
  const device = loadDeviceCredential();
  const clientId = device.clientId || createClientId();
  const stored = loadStoredIdentity();
  if (stored) {
    rememberIdentity({ clientId, displayName: stored.displayName });
    return {
      ready: true,
      clientId,
      name: stored.displayName,
      title: stored.title ?? "",
      location: stored.location ?? "",
      photoUri: stored.photoUri ?? "",
    };
  }
  return { ready: true, clientId, name: "", title: "", location: "", photoUri: "" };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(initialSession);

  useEffect(() => {
    if (session.ready) {
      return;
    }
    const stored = loadStoredIdentity();
    if (stored) {
      setSession({
        ready: true,
        clientId: stored.clientId,
        name: stored.displayName,
        title: stored.title ?? "",
        location: stored.location ?? "",
        photoUri: stored.photoUri ?? "",
      });
      return;
    }
    setSession({ ready: true, clientId: loadDeviceCredential().clientId || createClientId(), name: "", title: "", location: "", photoUri: "" });
  }, [session.ready]);

  useEffect(() => {
    if (!session.ready || !session.clientId) {
      return;
    }
    rememberIdentity({ clientId: session.clientId, displayName: session.name });
  }, [session]);

  function save(profile: ProfileInput) {
    const next = cleanProfile(profile);
    if (!next.displayName || !session.clientId) {
      return;
    }
    storeIdentity({ clientId: session.clientId, ...next });
    rememberIdentity({ clientId: session.clientId, displayName: next.displayName });
    setSession({
      ready: true,
      clientId: session.clientId,
      name: next.displayName,
      title: next.title,
      location: next.location,
      photoUri: next.photoUri,
    });
    announcePresence(next.displayName);
  }

  function rename(nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === session.name) {
      return;
    }
    save({ name: trimmed, title: session.title, location: session.location, photoUri: session.photoUri });
  }

  return (
    <SessionContext.Provider
      value={{
        clientId: session.clientId,
        name: session.name,
        title: session.title,
        location: session.location,
        photoUri: session.photoUri,
        ready: session.ready,
        enter: save,
        updateProfile: save,
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
