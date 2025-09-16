/* eslint-disable @typescript-eslint/no-floating-promises */

// import { GasolinaMain } from "../util/gas";
import React, { use, useState } from "react";
import { WalletContext } from "../providers/WalletProvider";
import {
  Account,
  BASE_FEE,
  Horizon,
  Operation,
  TransactionBuilder,
  Address,
  xdr,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { networkPassphrase, horizonUrl } from "../contracts/util";
import { submitToRelay } from "../util/relay";
import { Scene3D } from "../components/Scene3D";

const ROUTER_CONTRACT_ID =
  "CCNXMLQRLAAZ5MGK5HXMWFDZEU6SE67Y5CHI3QTKXIGY46PUU5NJJZS5"; // C...
const USDC_TOKEN_CONTRACT_ID =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"; // C...
// const USDC_ISSUER             = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
// const USDC_CODE               = 'USDC';
const XLM_TOKEN_CONTRACT_ID =
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const SOROSWAP_ROUTER_ID =
  "CCMAPXWVZD4USEKDWRYS7DA4Y3D7E2SDMGBFJUCEXTC7VN6CUBGWPFUS";

const SCALE = 10 ** 7;

const RATE_XLM_TO_USDC = 0.4;
const XLM_EXTRA_MARGIN = 0.001;

const relayerAddress =
  "GDK3574YRVN2ZJXM7C7R6RZINED42CMDZBO3SWK75JIOWDBUFXDDMB56";

// Soroban token amounts are often i128; if your token uses u64, keep u64 like below
const AMOUNT = BigInt(10_000); // u64 example (e.g., 0.10 USDC with 6 dp)

// ---------- Build ScVals ----------
const scAddr = (a: string) => new Address(a).toScVal();
const scSym = (s: string) => xdr.ScVal.scvSymbol(s);
const scVec = (vals: xdr.ScVal[]) => xdr.ScVal.scvVec(vals);

// ---------- Estimate Gas ----------
function estimateGas() {
  return 2 * Number(BASE_FEE);
}

function amountInMaxUsdc() {
  return Math.ceil(
    (estimateGas() * RATE_XLM_TO_USDC + XLM_EXTRA_MARGIN) * SCALE,
  );
}
// soroswap deadline permanent forever
const DEADLINE_FOREVER = 32_503_680_000;

// Build one invocation tuple: (Address contract, Symbol method, Vec<Val> args, bool can_fail)
function buildInvocation_UsdcTransfer(
  fromG: string,
  toG: string,
  amount: bigint,
): xdr.ScVal {
  // If your token expects i128, switch to: nativeToScVal(amount, { type: 'i128' })
  const args = scVec([
    scAddr(fromG),
    scAddr(toG),
    nativeToScVal(amount, { type: "i128" }),
  ]);
  return scVec([
    scAddr(USDC_TOKEN_CONTRACT_ID), // contract (Address)
    scSym("transfer"), // method (Symbol)
    args, // args (Vec<Val>)
    xdr.ScVal.scvBool(false), // can_fail = false
  ]);
}

function buildInvocation_UsdcSwapXlm(
  amount_out: number,
  amount_in_max: number,
  callerG: string,
  deadline: number,
): xdr.ScVal {
  const args = scVec([
    nativeToScVal(amount_out, { type: "i128" }), // amount_out (i128)
    nativeToScVal(amount_in_max, { type: "i128" }), // amount_out_min (i128)
    xdr.ScVal.scvVec([
      // path: Vec<Address> = [USDC, XLM]
      Address.fromString(USDC_TOKEN_CONTRACT_ID).toScVal(),
      Address.fromString(XLM_TOKEN_CONTRACT_ID).toScVal(),
    ]),
    Address.fromString(callerG).toScVal(), // to
    nativeToScVal(deadline, { type: "u64" }), // deadline (unix seconds)
  ]);
  return scVec([
    scAddr(SOROSWAP_ROUTER_ID), // contract (Address)
    scSym("swap_tokens_for_exact_tokens"), // method (Symbol)
    args, // args (Vec<Val>)
    xdr.ScVal.scvBool(false), // can_fail = false
  ]);
}

const Home: React.FC = () => {
  const [shouldZoom, setShouldZoom] = useState(false);

  const handleZoomClick = () => {
    console.log("Botón clickeado, shouldZoom actual:", shouldZoom);
    if (shouldZoom === false) {
      handleSignTransaction();
    }
    setShouldZoom(!shouldZoom);
  };

  // TODO: add isSigning to state
  // const [ setIsSigning] = useState(false);
  // callerG
  const { address, signTransaction } = use(WalletContext);
  // const payerG   = backendKeypair.publicKey();  // fee payer / sourceAccount
  // const recipientG= recipientKeypair.publicKey();
  // GasolinaMain();

  const handleSignTransaction = async () => {
    if (!address) {
      alert("Please connect your wallet first");
      return;
    }

    if (!signTransaction) {
      alert("Wallet does not support transaction signing");
      return;
    }

    // setIsSigning(true);
    try {
      const horizonServer = new Horizon.Server(horizonUrl); // You'll need to define horizonUrl

      // Get account information from Horizon (more reliable for account data)
      console.log("Fetching account information...");
      const accountRecord = await horizonServer.loadAccount(address); // Changed from accounts().accountId()
      // const baseFee = await horizonServer.fetchBaseFee();

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
      // const transaction = new TransactionBuilder(account, {
      //   fee: baseFee.toString(),
      //   networkPassphrase: networkPassphrase,
      // })
      //   .addOperation(
      //     Operation.payment({
      //       destination:
      //         "GCVROJRT5EA7OGQ75JKD67GPVCLR4DJXPCWVEQR5B22KWZCMR63ZJ4KL",
      //       asset: Asset.native(),
      //       amount: "1",
      //     }),
      //   )
      //   .setTimeout(30)
      //   .build();

      // Convert to XDR for signing
      // const transactionXdr = transaction.toXDR();
      // console.log("transactionXdr", transactionXdr);

      // Sign the transaction with the wallet
      // const result = await signTransaction(transactionXdr, {
      //   networkPassphrase: networkPassphrase,
      //   address: address,
      // });
      // console.log("result", result);

      // Log the signed XDR to console
      // const signedXdr = result.signedTxXdr;
      // console.log("signedXdr", signedXdr);
      // console.log("✅ Transaction created and signed successfully!");
      // console.log("📝 Transaction XDR:", transactionXdr);
      // console.log("📝 Signed XDR:", signedXdr);
      // console.log("🔍 Signing result:", result);
      // console.log("🔍 Transaction details:", {
      //   source: transaction.source,
      //   destination: relayerAddress,
      //   amount: "1 XLM",
      //   fee: transaction.fee,
      //   operations: transaction.operations.length,
      //   timeBounds: transaction.timeBounds,
      //   networkPassphrase: networkPassphrase,
      // });

      // Update the input with the signed XDR

      console.log("address", address);
      console.log("relayerAddress", relayerAddress);
      console.log("AMOUNT", AMOUNT);
      console.log("estimateGas", estimateGas());
      console.log("amountInMaxUsdc", amountInMaxUsdc());
      console.log("DEADLINE_FOREVER", DEADLINE_FOREVER);
      console.log("ROUTER_CONTRACT_ID", ROUTER_CONTRACT_ID);

      const invocationsVec = scVec([
        buildInvocation_UsdcTransfer(address, relayerAddress, AMOUNT),
        buildInvocation_UsdcSwapXlm(
          estimateGas(),
          amountInMaxUsdc(),
          address,
          DEADLINE_FOREVER,
        ),
      ]);
      const routerArgs: xdr.ScVal[] = [
        scAddr(address), // caller
        invocationsVec, // invocations Vec
      ];

      // ---------- 1) Build op WITHOUT auth ----------
      const opWithoutAuth = Operation.invokeContractFunction({
        contract: ROUTER_CONTRACT_ID,
        function: "exec",
        args: routerArgs,
      });

      console.log("opWithoutAuth", opWithoutAuth);

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase: networkPassphrase,
      })
        .addOperation(opWithoutAuth)
        .setTimeout(30)
        .build();

      const transactionXdr = transaction.toXDR();
      console.log("transactionXdr", transactionXdr);

      const result = await signTransaction(transactionXdr, {
        networkPassphrase: networkPassphrase,
        address: address,
      });
      console.log("result", result);

      const signedXdr = result.signedTxXdr;
      console.log("signedXdr", signedXdr);

      console.log("✅ Transaction created and signed successfully!");
      console.log("📝 Transaction XDR:", transactionXdr);
      console.log("📝 Signed XDR:", signedXdr);
      console.log("🔍 Signing result:", result);

      submitToRelay(signedXdr);
    } catch (err) {
      console.error("❌ Failed to create or sign transaction:", err);
      alert(
        `Failed to create or sign transaction: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      // setIsSigning(false);
    }
  };

  console.log(`callerG: ${address}`);
  // console.log(`payerG: ${payerG}`);
  // console.log(`recipientG: ${recipientG}`);

  return (
    <>
      <div
        style={{
          width: "100vw",
          height: "100vh",
          margin: 0,
          padding: 0,
          overflow: "hidden",
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 1,
        }}
      >
        <Scene3D className="fullscreen-scene" shouldZoom={shouldZoom} />
      </div>

      {/* Botón de zoom centrado */}
      <div
        style={{
          position: "fixed",
          top: "90%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 2,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <button
          onClick={handleZoomClick}
          style={{
            padding: "16px 32px",
            borderRadius: "16px",
            fontWeight: "600",
            color: "white",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            background: "linear-gradient(135deg, #8B5CF6, #7C3AED)",
            boxShadow: "0 8px 32px rgba(139, 92, 246, 0.6)",
            backdropFilter: "blur(10px)",
            fontSize: "18px",
            minWidth: "220px",
            minHeight: "70px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
            outline: "none",
            textShadow: "0 2px 4px rgba(0, 0, 0, 0.5)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow =
              "0 12px 40px rgba(139, 92, 246, 0.8)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow =
              "0 8px 32px rgba(139, 92, 246, 0.6)";
          }}
        >
          {shouldZoom ? "Done" : "Pagar sin XLM - Dale Gas"}
        </button>
      </div>
    </>
  );
};
export default Home;
