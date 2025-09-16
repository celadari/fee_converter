/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

export interface RelayResponse {
  success: boolean;
  transactionHash: string;
  ledger: number;
  sponsor: string;
  sponsoredTransactionHash?: string;
  transactionType?: string;
  submittedAt: string;
}

export interface RelayError {
  error: string;
  message: string;
  stellarError?: any;
}

/**
 * Submit a signed XDR transaction to the relay backend for sponsored execution
 * @param xdr - The signed XDR transaction string
 * @returns Promise with the relay response or error
 */
export async function submitToRelay(xdr: string): Promise<RelayResponse> {
  try {
    const response = await fetch("http://localhost:3001/relay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        xdr: xdr,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || data.error || "Failed to submit transaction to relay",
      );
    }

    return data as RelayResponse;
  } catch (error) {
    console.error("Error submitting to relay:", error);
    throw error;
  }
}

/**
 * Check the health status of the relay backend
 * @returns Promise with the health status
 */
export async function checkRelayHealth(): Promise<{
  status: string;
  timestamp: string;
  service: string;
}> {
  try {
    const response = await fetch("http://localhost:3001/health");

    if (!response.ok) {
      throw new Error("Relay backend is not healthy");
    }

    return await response.json();
  } catch (error) {
    console.error("Error checking relay health:", error);
    throw error;
  }
}

/**
 * Create a transaction that can be sponsored by the relay
 * This function prepares a transaction for sponsorship by removing the source account
 * and allowing the relay to set the sponsor as the source
 */
// export function prepareTransactionForSponsorship(transaction: Transaction): Transaction {
//   // Clone the transaction to avoid modifying the original
//   const clonedTx = TransactionBuilder.fromXDR(transaction.toXDR(), transaction.networkPassphrase);

//   // The relay will handle setting the sponsor as the source account
//   // We just need to ensure the transaction is properly formatted
//   return clonedTx;
// }
