/* eslint-disable @typescript-eslint/no-misused-promises */

// import { GasolinaMain } from "../util/gas";
import React, { use } from "react";
import { Code, Layout } from "@stellar/design-system";
import { RelayExample } from "../components/RelayExample";
import { WalletContext } from "../providers/WalletProvider";
import {
  Account,
  Asset,
  BASE_FEE,
  Horizon,
  Operation,
  TransactionBuilder,
  Address,
  xdr,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { networkPassphrase, horizonUrl } from "../contracts/util";

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
        destination: relayerAddress,
        amount: "1 XLM",
        fee: transaction.fee,
        operations: transaction.operations.length,
        timeBounds: transaction.timeBounds,
        networkPassphrase: networkPassphrase,
      });

      // Update the input with the signed XDR

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
    <Layout.Content>
      <Layout.Inset>
        <button onClick={() => handleSignTransaction()}>Gasolina Main</button>
        <h1>Welcome to your app!</h1>
        <p>
          This is a basic template to get your dapp started with the Stellar
          Design System and Stellar contracts. You can customize it further by
          adding your own contracts, components, and styles.
        </p>
        <h2>Developing your contracts</h2>
        <p>
          Your contracts are located in the contracts/ directory, and you can
          modify them to suit your needs.
        </p>
        <p>
          As you update them, the <Code size="md">stellar scaffold watch</Code>{" "}
          command will automatically recompile them and update the dapp with the
          latest changes.
        </p>
        <h2>Interacting with contracts from the frontend</h2>
        Scaffold stellar automatically builds your contract packages, and you
        can import them in your frontend code like this:
        <pre>
          <Code size="md">{`import stellar_hello_world_contract from "./contracts/stellar_hello_world_contract.ts";`}</Code>
        </pre>
        <p>And then you can call the contract methods like this:</p>
        <pre>
          <Code size="md">{`const statusMessage = await stellar_hello_world_contract.hello({"to": "world"});`}</Code>
        </pre>
        <p>
          By doing this, you can use the contract methods in your components. If
          your contract emits events, check out the{" "}
          <Code size="md">useSubscription</Code> hook in the hooks/ folder to
          listen to them.
        </p>
        <h2>Interacting with wallets</h2>
        <p>
          This project is already integrated with Stellar Wallet Kit, and the
          {` useWallet `} hook is available for you to use in your components.
          You can use it to connect to get connected account information.
        </p>
        <h2>Deploying your app</h2>
        <p>
          To deploy your contracts, use the{" "}
          <Code size="md">stellar contract deploy</Code> command (
          <a href="https://developers.stellar.org/docs/build/guides/cli/install-deploy">
            docs
          </a>
          ) to deploy to the appropriate Stellar network.
        </p>
        <p>
          Build your frontend application code with{" "}
          <Code size="md">npm run build</Code> and deploying the output in the
          <Code size="md">dist/</Code> directory.
        </p>
        <h2>Relay Example</h2>
        <p>
          Try the relay example below to create and sign a transaction that
          sends 1 XLM to a specific address.
        </p>
        <RelayExample />
      </Layout.Inset>
    </Layout.Content>
  );
};
export default Home;
