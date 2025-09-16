import { useState, useCallback } from "react";
import { submitToRelay, checkRelayHealth, RelayResponse } from "../util/relay";

export interface UseRelayReturn {
  submitTransaction: (xdr: string) => Promise<RelayResponse>;
  checkHealth: () => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  lastResponse: RelayResponse | null;
}

export function useRelay(): UseRelayReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<RelayResponse | null>(null);

  const submitTransaction = useCallback(
    async (xdr: string): Promise<RelayResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await submitToRelay(xdr);
        setLastResponse(response);
        return response;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      await checkRelayHealth();
      return true;
    } catch (err) {
      console.error("Relay health check failed:", err);
      return false;
    }
  }, []);

  return {
    submitTransaction,
    checkHealth,
    isLoading,
    error,
    lastResponse,
  };
}
