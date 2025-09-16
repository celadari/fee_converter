/* eslint-disable @typescript-eslint/no-misused-promises */

import { useState, use } from "react";
import {
  TransactionBuilder,
  Asset,
  Operation,
  Account,
  Horizon,
} from "@stellar/stellar-sdk";
import { useRelay } from "../hooks/useRelay";
import { WalletContext } from "../providers/WalletProvider";
import { networkPassphrase, horizonUrl } from "../contracts/util";

export function RelayExample() {
  const { submitTransaction, checkHealth, isLoading, error, lastResponse } =
    useRelay();
  const { address, signTransaction } = use(WalletContext);
  const [xdrInput, setXdrInput] = useState("");
  const [isHealthCheckLoading, setIsHealthCheckLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<boolean | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const handleSubmitXdr = async () => {
    if (!xdrInput.trim()) {
      alert("Please enter an XDR transaction");
      return;
    }

    try {
      // Submit the signed XDR directly to the relay API
      const response = await submitTransaction(xdrInput);
      console.log("Transaction submitted successfully:", response);
    } catch (err) {
      console.error("Failed to submit transaction:", err);
    }
  };

  const handleHealthCheck = async () => {
    setIsHealthCheckLoading(true);
    try {
      const isHealthy = await checkHealth();
      setHealthStatus(isHealthy);
    } catch (err) {
      console.error("Failed to check health:", err);
      setHealthStatus(false);
    } finally {
      setIsHealthCheckLoading(false);
    }
  };

  const handleSignTransaction = async () => {
    if (!address) {
      alert("Please connect your wallet first");
      return;
    }

    if (!signTransaction) {
      alert("Wallet does not support transaction signing");
      return;
    }

    setIsSigning(true);
    try {
      const horizonServer = new Horizon.Server(horizonUrl); // You'll need to define horizonUrl

      // Get account information from Horizon (more reliable for account data)
      console.log("Fetching account information...");
      const accountRecord = await horizonServer.loadAccount(address); // Changed from accounts().accountId()
      const baseFee = await horizonServer.fetchBaseFee();

      // Create Account object - accountRecord is already an Account-like object
      const account = new Account(
        accountRecord.accountId(),
        accountRecord.sequenceNumber(),
      );
      console.log(
        "Account loaded:",
        account.accountId(),
        "Sequence:",
        account.sequenceNumber(),
      );

      // Create transaction
      const transaction = new TransactionBuilder(account, {
        fee: baseFee.toString(),
        networkPassphrase: networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination:
              "GCVROJRT5EA7OGQ75JKD67GPVCLR4DJXPCWVEQR5B22KWZCMR63ZJ4KL",
            asset: Asset.native(),
            amount: "1",
          }),
        )
        .setTimeout(30)
        .build();

      // Convert to XDR for signing
      const transactionXdr = transaction.toXDR();
      console.log("transactionXdr", transactionXdr);

      // Sign the transaction with the wallet
      const result = await signTransaction(transactionXdr, {
        networkPassphrase: networkPassphrase,
        address: address,
      });
      console.log("result", result);

      // Log the signed XDR to console
      const signedXdr = result.signedTxXdr;
      console.log("signedXdr", signedXdr);
      console.log("✅ Transaction created and signed successfully!");
      console.log("📝 Transaction XDR:", transactionXdr);
      console.log("📝 Signed XDR:", signedXdr);
      console.log("🔍 Signing result:", result);
      console.log("🔍 Transaction details:", {
        source: transaction.source,
        destination: "GCVROJRT5EA7OGQ75JKD67GPVCLR4DJXPCWVEQR5B22KWZCMR63ZJ4KL",
        amount: "1 XLM",
        fee: transaction.fee,
        operations: transaction.operations.length,
        timeBounds: transaction.timeBounds,
        networkPassphrase: networkPassphrase,
      });

      // Update the input with the signed XDR
      setXdrInput(signedXdr);

      alert(
        "Transaction created and signed successfully! Check the console for details.",
      );
    } catch (err) {
      console.error("❌ Failed to create or sign transaction:", err);
      alert(
        `Failed to create or sign transaction: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsSigning(false);
    }
  };

  const createSampleTransaction = () => {
    // This is just for demonstration - in a real app, you'd create transactions based on user actions
    const sampleXdr = `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`;
    setXdrInput(sampleXdr);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h2>Relay Backend Example</h2>

      <div style={{ marginBottom: "20px" }}>
        <h3>Health Check</h3>
        <button
          onClick={handleHealthCheck}
          disabled={isHealthCheckLoading}
          style={{
            padding: "10px 20px",
            marginRight: "10px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {isHealthCheckLoading ? "Checking..." : "Check Health"}
        </button>
        {healthStatus !== null && (
          <span
            style={{
              color: healthStatus ? "green" : "red",
              fontWeight: "bold",
            }}
          >
            {healthStatus ? "✅ Healthy" : "❌ Unhealthy"}
          </span>
        )}
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h3>Submit XDR Transaction</h3>
        {address ? (
          <div
            style={{
              padding: "8px 12px",
              backgroundColor: "#d4edda",
              color: "#155724",
              border: "1px solid #c3e6cb",
              borderRadius: "4px",
              marginBottom: "10px",
              fontSize: "14px",
            }}
          >
            ✅ Wallet Connected: {address}
          </div>
        ) : (
          <div
            style={{
              padding: "8px 12px",
              backgroundColor: "#f8d7da",
              color: "#721c24",
              border: "1px solid #f5c6cb",
              borderRadius: "4px",
              marginBottom: "10px",
              fontSize: "14px",
            }}
          >
            ⚠️ Please connect your wallet to sign transactions
          </div>
        )}
        <div style={{ marginBottom: "10px" }}>
          <button
            onClick={createSampleTransaction}
            style={{
              padding: "8px 16px",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginRight: "10px",
              marginBottom: "10px",
            }}
          >
            Load Sample XDR
          </button>
          <button
            onClick={handleSignTransaction}
            disabled={isSigning || !address}
            style={{
              padding: "8px 16px",
              backgroundColor:
                isSigning || !xdrInput.trim() || !address
                  ? "#6c757d"
                  : "#17a2b8",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor:
                isSigning || !xdrInput.trim() || !address
                  ? "not-allowed"
                  : "pointer",
              marginBottom: "10px",
            }}
          >
            {isSigning
              ? "Creating & Signing..."
              : "Create & Sign 1 XLM Transfer"}
          </button>
        </div>

        <textarea
          value={xdrInput}
          onChange={(e) => setXdrInput(e.target.value)}
          placeholder="Paste your signed XDR transaction here..."
          style={{
            width: "100%",
            height: "200px",
            padding: "10px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontFamily: "monospace",
            fontSize: "12px",
            marginBottom: "10px",
          }}
        />

        <button
          onClick={handleSubmitXdr}
          disabled={isLoading || !xdrInput.trim()}
          style={{
            padding: "10px 20px",
            backgroundColor: isLoading ? "#6c757d" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "Submitting..." : "Submit to Relay"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "10px",
            backgroundColor: "#f8d7da",
            color: "#721c24",
            border: "1px solid #f5c6cb",
            borderRadius: "4px",
            marginBottom: "20px",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {lastResponse && (
        <div
          style={{
            padding: "10px",
            backgroundColor: "#d4edda",
            color: "#155724",
            border: "1px solid #c3e6cb",
            borderRadius: "4px",
          }}
        >
          <h4>Last Response:</h4>
          <pre style={{ fontSize: "12px", overflow: "auto" }}>
            {JSON.stringify(lastResponse, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
