import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { checkHealth } from '../lib/api';
import type { ReconciliationSummary } from '../lib/types';

interface SessionContextType {
  hasSession: boolean;
  sessionData: ReconciliationSummary | null;
  backendOnline: boolean;
  setSessionData: (data: ReconciliationSummary | null) => void;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [hasSession, setHasSession] = useState(false);
  const [sessionData, setSessionData] = useState<ReconciliationSummary | null>(null);
  const [backendOnline, setBackendOnline] = useState(true);

  const refreshSession = async () => {
    try {
      const health = await checkHealth();
      setBackendOnline(true);
      setHasSession(health.has_session);

      if (!health.has_session) {
        setSessionData(null);
      }
    } catch (error) {
      setBackendOnline(false);
      setHasSession(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  return (
    <SessionContext.Provider
      value={{
        hasSession,
        sessionData,
        backendOnline,
        setSessionData: (data) => {
          setSessionData(data);
          setHasSession(!!data);
        },
        refreshSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
