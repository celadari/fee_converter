import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import StellarSdk, { Networks } from "@stellar/stellar-sdk";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://yourdomain.com"]
        : ["http://localhost:5174", "http://localhost:3000"],
    credentials: true,
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
    const network = Networks.TESTNET; // Use Networks constant for consistency
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

      // Following the pattern from your example:
      // buildFeeBumpTransaction(sponsorAddress, newFee, originalTransaction, network)
      feeBumpTransaction =
        StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
          sponsorKeypair.publicKey(), // Sponsor address (public key)
          feeBumpFee, // New fee needs to be higher
          transaction, // Original transaction signed by user
          network, // Network constant
        );
      console.log("✅ Fee bump transaction created");
    } catch (feeBumpError) {
      console.error("❌ Failed to create fee bump transaction:", feeBumpError);
      return res.status(500).json({
        error: "Fee bump creation failed",
        message: "Failed to create fee bump transaction",
      });
    }

    // Sign the fee bump transaction
    try {
      console.log("✍️ Signing fee bump transaction...");
      feeBumpTransaction.sign(sponsorKeypair);
      console.log("✅ Fee bump transaction signed");
    } catch (signError) {
      console.error("❌ Failed to sign fee bump transaction:", signError);
      return res.status(500).json({
        error: "Signing failed",
        message: "Failed to sign fee bump transaction",
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
