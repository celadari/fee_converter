import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import StellarSdk, {
  NetworkError,
  rpc as StellarRpc,
} from "@stellar/stellar-sdk";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const rpcUrl = process.env.STELLAR_RPC_URL;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: "*",
  }),
);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "gasolina-relay-backend",
  });
});

// Relay endpoint for sponsored transactions
app.post("/relay", async (req, res) => {
  console.log("🚀 Relay endpoint called");
  console.log("📥 Request body keys:", Object.keys(req.body));

  try {
    const { xdr: signedXdr } = req.body;
    console.log("📥 Received XDR:", signedXdr ? "Present" : "Missing");
    console.log("📥 XDR type:", typeof signedXdr);

    // Validate input
    if (!signedXdr || typeof signedXdr !== "string") {
      console.log("❌ Invalid XDR input");
      return res.status(400).json({
        error: "Invalid request",
        message: "XDR transaction is required and must be a string",
      });
    }

    // Validate environment variables
    if (!process.env.SPONSOR_SECRET_KEY) {
      console.error("SPONSOR_SECRET_KEY environment variable is not set");
      return res.status(500).json({
        error: "Server configuration error",
        message: "Sponsor key not configured",
      });
    }

    if (!process.env.STELLAR_RPC_URL) {
      console.error("STELLAR_RPC_URL environment variable is not set");
      return res.status(500).json({
        error: "Server configuration error",
        message: "Stellar RPC URL not configured",
      });
    }

    // Set up Stellar SDK
    const networkPassphrase =
      process.env.STELLAR_NETWORK_PASSPHRASE ||
      "Test SDF Network ; September 2015";
    const network = StellarSdk.Networks.TESTNET; // Use Networks constant for consistency
    console.log(
      "🔧 Setting up Stellar SDK with network passphrase:",
      networkPassphrase,
    );
    console.log("🔧 RPC URL:", process.env.STELLAR_RPC_URL);

    // Create server instance - use Horizon for transaction submission
    const horizonUrl = "https://horizon-testnet.stellar.org";
    const server = new StellarSdk.Horizon.Server(horizonUrl);
    console.log("✅ Horizon server instance created with URL:", horizonUrl);

    // Parse the signed transaction
    let transaction;
    try {
      console.log("📝 Parsing XDR transaction...");
      console.log("📝 XDR length:", signedXdr.length);
      transaction = StellarSdk.TransactionBuilder.fromXDR(signedXdr, network);
      console.log("✅ Transaction parsed successfully");
      console.log("📝 Transaction source:", transaction.source);
      console.log(
        "📝 Transaction operations count:",
        transaction.operations.length,
      );

      // Debug: Log original transaction details
      console.log("🔍 Original transaction details:");
      console.log("  - Type:", transaction.constructor.name);
      console.log("  - Fee:", transaction.fee);
      console.log("  - Sequence:", transaction.sequence);
      console.log("  - Network passphrase:", transaction.networkPassphrase);
      console.log("  - Hash:", transaction.hash().toString("hex"));
      console.log(
        "  - Operations:",
        transaction.operations.map((op) => op.type),
      );
      console.log("  - Signatures count:", transaction.signatures.length);
      console.log("  - Is signed:", transaction.signatures.length > 0);

      // Debug: Check if this is a Soroban transaction
      if (
        transaction.operations.some((op) => op.type === "invokeHostFunction")
      ) {
        console.log("🔍 This is a Soroban transaction!");
        console.log("  - Has Soroban data:", !!transaction.sorobanData);
        if (transaction.sorobanData) {
          console.log(
            "  - Soroban data:",
            JSON.stringify(transaction.sorobanData, null, 2),
          );
        }
        console.log("  - Resource fee:", transaction.resourceFee || "Not set");

        // If Soroban transaction is missing data, we need to prepare it
        if (!transaction.sorobanData) {
          console.log(
            "⚠️  Soroban transaction is missing data - this will cause tx_malformed",
          );
          console.log(
            "💡 The frontend should use server.prepareTransaction() before signing",
          );
          console.log("🔧 For now, we'll try to prepare it on the backend...");

          try {
            // Create a Soroban server instance to prepare the transaction
            const sorobanServer = new StellarRpc.Server(rpcUrl);
            console.log("📡 Preparing Soroban transaction...");

            // Prepare the transaction to add Soroban data
            const preparedTransaction =
              await sorobanServer.prepareTransaction(transaction);
            transaction.sign(accountKeypair);
            console.log("✅ Soroban transaction prepared successfully");
            console.log(
              "  - Has Soroban data:",
              !!preparedTransaction.sorobanData,
            );
            console.log(
              "  - Resource fee:",
              preparedTransaction.resourceFee || "Not set",
            );

            // Use the prepared transaction for fee bump
            // Note: The original transaction was already signed by the user in the frontend
            // We'll use the prepared transaction as-is for the fee bump
            transaction = preparedTransaction;
            console.log("🔄 Using prepared transaction for fee bump");
          } catch (prepareError) {
            console.error(
              "❌ Failed to prepare Soroban transaction:",
              prepareError.message,
            );
            return res.status(400).json({
              error: "Soroban transaction preparation failed",
              message:
                "The Soroban transaction is missing required data and cannot be prepared. The frontend should use server.prepareTransaction() before signing.",
              details: prepareError.message,
            });
          }
        }
      }

      // Debug: Validate original transaction XDR
      try {
        const originalXdr = transaction.toXDR();
        console.log("📝 Original XDR length:", originalXdr.length);
        const parsedOriginalXdr = StellarSdk.xdr.TransactionEnvelope.fromXDR(
          originalXdr,
          "base64",
        );
        console.log("✅ Original XDR is valid and parseable");
        console.log(
          "🔍 Original XDR structure type:",
          parsedOriginalXdr.switch().name,
        );
      } catch (xdrError) {
        console.error("❌ Original XDR is malformed:", xdrError);
        return res.status(400).json({
          error: "Malformed original XDR",
          message: "The provided XDR transaction is malformed",
          details: xdrError.message,
        });
      }
    } catch (parseError) {
      console.error("❌ Failed to parse XDR transaction:", parseError);
      return res.status(400).json({
        error: "Invalid XDR",
        message: "Failed to parse the provided XDR transaction",
      });
    }

    // Get the sponsor keypair
    let sponsorKeypair;
    try {
      console.log("🔑 Creating sponsor keypair...");
      sponsorKeypair = StellarSdk.Keypair.fromSecret(
        process.env.SPONSOR_SECRET_KEY,
      );
      console.log("✅ Sponsor keypair created");
      console.log("🔑 Sponsor public key:", sponsorKeypair.publicKey());
    } catch (keyError) {
      console.error("❌ Invalid sponsor secret key:", keyError);
      return res.status(500).json({
        error: "Invalid sponsor key",
        message: "The configured sponsor secret key is invalid",
      });
    }

    // Check sponsor account balance before creating fee bump
    try {
      console.log("🔍 Checking sponsor account...");
      const sponsorAccount = await server.loadAccount(
        sponsorKeypair.publicKey(),
      );
      console.log("✅ Sponsor account loaded");
      console.log(
        "💰 Sponsor balance:",
        sponsorAccount.balances[0]?.balance || "Unknown",
      );
      console.log("📊 Sponsor sequence:", sponsorAccount.sequenceNumber());

      // Check if sponsor has sufficient XLM balance (find native XLM balance)
      const xlmBalance = sponsorAccount.balances.find(
        (balance) => balance.asset_type === "native",
      );
      const sponsorBalance = parseFloat(xlmBalance?.balance || "0");
      const requiredBalance = 0.01; // Need at least 0.01 XLM for fees

      console.log("sponsorBalances", sponsorAccount.balances);
      console.log("💰 XLM Balance found:", sponsorBalance, "XLM");

      if (sponsorBalance < requiredBalance) {
        console.error(
          "❌ Insufficient sponsor balance:",
          sponsorBalance,
          "XLM",
        );
        return res.status(500).json({
          error: "Insufficient sponsor balance",
          message: `Sponsor account has ${sponsorBalance} XLM but needs at least ${requiredBalance} XLM to pay transaction fees. Please fund the sponsor account.`,
          sponsorAddress: sponsorKeypair.publicKey(),
          currentBalance: sponsorBalance,
          requiredBalance: requiredBalance,
        });
      }
    } catch (accountError) {
      console.error("❌ Failed to load sponsor account:", accountError);
      return res.status(500).json({
        error: "Sponsor account error",
        message:
          "Failed to load sponsor account - check if account exists and has sufficient balance",
      });
    }

    // Create a FeeBumpTransaction to sponsor the original transaction
    // This is the proper way to sponsor transactions in Stellar
    let feeBumpTransaction;
    try {
      console.log("💰 Creating fee bump transaction...");
      console.log("💰 Original transaction fee:", transaction.fee);
      console.log("💰 Sponsor address:", sponsorKeypair.publicKey());

      // Use a higher fee for fee bump (minimum 100 stroops more)
      const feeBumpFee = Math.max(transaction.fee + 100, 200);
      console.log("💰 Fee bump fee:", feeBumpFee);

      // Following the official Stellar SDK documentation pattern:
      // buildFeeBumpTransaction(feeKeypair, fee, innerTransaction, networkPassphrase)
      feeBumpTransaction =
        StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
          // sponsorKeypair, // Sponsor keypair (not just public key)
          // feeBumpFee, // New fee needs to be higher
          // transaction, // Original transaction signed by user
          // networkPassphrase // Network passphrase string (not Networks constant)
          sponsorKeypair.publicKey(),
          transaction.fee + 1,
          transaction,
          StellarSdk.Networks.TESTNET,
        );
      console.log("✅ Fee bump transaction created");

      // Debug: Log transaction details
      console.log("🔍 Fee bump transaction details:");
      console.log("  - Type:", feeBumpTransaction.constructor.name);
      console.log("  - Fee source:", feeBumpTransaction.feeSource);
      console.log("  - Fee:", feeBumpTransaction.fee);
      console.log(
        "  - Inner transaction hash:",
        feeBumpTransaction.innerTransaction.hash().toString("hex"),
      );
      console.log(
        "  - Network passphrase:",
        feeBumpTransaction.networkPassphrase,
      );

      // Debug: Log inner transaction details
      console.log("🔍 Inner transaction details:");
      console.log(
        "  - Type:",
        feeBumpTransaction.innerTransaction.constructor.name,
      );
      console.log("  - Source:", feeBumpTransaction.innerTransaction.source);
      console.log("  - Fee:", feeBumpTransaction.innerTransaction.fee);
      console.log(
        "  - Sequence:",
        feeBumpTransaction.innerTransaction.sequence,
      );
      console.log(
        "  - Operations count:",
        feeBumpTransaction.innerTransaction.operations.length,
      );
      console.log(
        "  - Network passphrase:",
        feeBumpTransaction.innerTransaction.networkPassphrase,
      );

      // Debug: Check if inner transaction has Soroban data
      if (
        feeBumpTransaction.innerTransaction.operations.some(
          (op) => op.type === "invokeHostFunction",
        )
      ) {
        console.log("🔍 Inner transaction is a Soroban transaction!");
        console.log(
          "  - Has Soroban data:",
          !!feeBumpTransaction.innerTransaction.sorobanData,
        );
        if (feeBumpTransaction.innerTransaction.sorobanData) {
          console.log(
            "  - Inner Soroban data:",
            JSON.stringify(
              feeBumpTransaction.innerTransaction.sorobanData,
              null,
              2,
            ),
          );
        }
        console.log(
          "  - Inner resource fee:",
          feeBumpTransaction.innerTransaction.resourceFee || "Not set",
        );
      }

      // Debug: Log XDR before signing
      const feeBumpXdrBeforeSigning = feeBumpTransaction.toXDR();
      console.log(
        "📝 Fee bump XDR (before signing):",
        feeBumpXdrBeforeSigning.substring(0, 100) + "...",
      );
    } catch (feeBumpError) {
      console.error("❌ Failed to create fee bump transaction:", feeBumpError);
      console.error("❌ Fee bump error details:", {
        message: feeBumpError.message,
        stack: feeBumpError.stack,
        name: feeBumpError.name,
      });
      return res.status(500).json({
        error: "Fee bump creation failed",
        message: "Failed to create fee bump transaction",
        details: feeBumpError.message,
      });
    }

    // Sign the fee bump transaction
    try {
      console.log("✍️ Signing fee bump transaction...");
      feeBumpTransaction.sign(sponsorKeypair);
      console.log("✅ Fee bump transaction signed");

      // Debug: Log XDR after signing
      const feeBumpXdrAfterSigning = feeBumpTransaction.toXDR();
      console.log(
        "📝 Fee bump XDR (after signing):",
        feeBumpXdrAfterSigning.substring(0, 100) + "...",
      );
      console.log("📝 Fee bump XDR length:", feeBumpXdrAfterSigning.length);

      // Debug: Validate XDR structure
      try {
        const parsedXdr = StellarSdk.xdr.TransactionEnvelope.fromXDR(
          feeBumpXdrAfterSigning,
          "base64",
        );
        console.log("✅ Fee bump XDR is valid and parseable");
        console.log("🔍 XDR structure type:", parsedXdr.switch().name);
      } catch (xdrError) {
        console.error("❌ Fee bump XDR is malformed:", xdrError);
        return res.status(500).json({
          error: "Malformed XDR",
          message: "Generated fee bump XDR is malformed",
          details: xdrError.message,
        });
      }
    } catch (signError) {
      console.error("❌ Failed to sign fee bump transaction:", signError);
      console.error("❌ Signing error details:", {
        message: signError.message,
        stack: signError.stack,
        name: signError.name,
      });
      return res.status(500).json({
        error: "Signing failed",
        message: "Failed to sign fee bump transaction",
        details: signError.message,
      });
    }

    // Submit the fee bump transaction
    try {
      console.log("📤 Submitting fee bump transaction to network...");
      const result = await server.submitTransaction(feeBumpTransaction);
      console.log("✅ Transaction submitted successfully");

      console.log("Fee bump transaction submitted successfully:", {
        hash: result.hash,
        ledger: result.ledger,
        sponsor: sponsorKeypair.publicKey(),
        originalTransactionHash: transaction.hash().toString("hex"),
      });

      res.json({
        success: true,
        transactionHash: result.hash,
        ledger: result.ledger,
        sponsor: sponsorKeypair.publicKey(),
        sponsoredTransactionHash: transaction.hash().toString("hex"),
        transactionType: "fee_bump",
        submittedAt: new Date().toISOString(),
      });
    } catch (submitError) {
      console.error("❌ Failed to submit fee bump transaction:", submitError);

      // Log detailed error information
      if (submitError.response && submitError.response.data) {
        console.error(
          "❌ Horizon error details:",
          JSON.stringify(submitError.response.data, null, 2),
        );

        // Extract result codes for better debugging
        if (
          submitError.response.data.extras &&
          submitError.response.data.extras.result_codes
        ) {
          console.error(
            "❌ Transaction result codes:",
            submitError.response.data.extras.result_codes,
          );
        }
      }

      return res.status(500).json({
        error: "Submission failed",
        message: "Failed to submit fee bump transaction to network",
        details: submitError.response?.data || submitError.message,
      });
    }
  } catch (error) {
    console.error("Error processing relay request:", error);

    // Handle specific Stellar errors
    if (error.response) {
      const stellarError = error.response.data;
      return res.status(400).json({
        error: "Transaction failed",
        message:
          stellarError.detail ||
          stellarError.title ||
          "Transaction submission failed",
        stellarError: stellarError,
      });
    }

    // Handle other errors
    res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred while processing the transaction",
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: "An unexpected error occurred",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not found",
    message: "The requested endpoint does not exist",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Gasolina Relay Backend running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔄 Relay endpoint: http://localhost:${PORT}/relay`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
