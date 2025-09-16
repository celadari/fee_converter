# Gasolina – Gas-abstraction SDK for Soroban
![Logo](./gasolina_logo.png)

## What problem does this tackle?

1. **Paying gas for users**  
   Apps/wallets often sponsor fees so UX stays smooth. But sponsorship:
    - increases attack surface,
    - forces the app to constantly monitor & top up its XLM balance.

2. **No common framework**  
   Every project re-implements a bespoke solution from scratch.

3. **Soroban is trickier than Stellar Classic**  
   Classic sponsorship is “relatively” simple. In Soroban, a transaction with a contract invocation can only contain **one** such operation, so composing multiple actions requires an indirection.

## Solution

**Gasolina** is a tiny SDK that lets apps (wallets, DEXes, etc.) **prepay** gas and get **refunded immediately** in the same flow.

- The **user signs once** (no extra prompts) and sends the signed *authorization entry* to the backend (relayer/payer).
- The **backend** submits the transaction on-chain and receives a refund (e.g., in USDC) via a bundled call.

Because Soroban allows only one invoke op per transaction, we use **RouterV1** to bundle calls:
- RouterV1 repo: <https://github.com/Creit-Tech/Stellar-Router-Contract/tree/main/contracts/router-v1/src>

In this hackathon demo we use two inner calls:
1. **Soroswap** `swap_tokens_for_exact_tokens` to buy the required XLM for gas using USDC and **pay it to the relayer** (refund).
2. **USDC token** `transfer` to send user-intended funds to a recipient.

> The same pattern generalizes: users can interact with contracts while paying fees in USDC instead of XLM.

## How it works (4 steps)

1. **Frontend** builds a RouterV1 op that wraps two calls:  
   `[ swap_usdc_to_xlm_and_pay_back_backend, transfer ]`, then sends it to the backend.
2. **Backend** simulates the draft transaction to discover `required_auth`, and returns the user’s **unsigned** auth entry.
3. **Frontend** has the user **sign the auth entry** (not the transaction) and sends it back.
4. **Backend** rebuilds the op **with signed auth**, assembles resource footprint/fees, signs the transaction as payer, and submits.

**UX note:** The user **signs only once** — it feels like a normal single-sign flow.

## How to simply run?

You can use **pnpm** or **npm**. No environment variables needed — demo input parameters are **hardcoded** to make the script easy to run.

**Using pnpm:**

```bash
pnpm install
pnpm exec ts-node scripts/sdk.ts
```

**Using npm (equivalent):**

```bash
npm install
npx ts-node scripts/sdk.ts
```

## Project structure

- `scripts/` – SDK methods plus a `main` entry to see how it runs end-to-end.
    - `scripts/sdk.ts` – core library (documented).
- `showcase/` – example app showing how to abstract XLM gas and charge in USDC instead.

## SDK functions

### Signer interfaces

```typescript
export interface AuthEntrySigner {
    getPublicKey(): string | Promise<string>;
    signAuthEntry(
        unsigned: xdr.SorobanAuthorizationEntry,
        validUntilLedger: number,
        networkPassphrase: string
    ): Promise<xdr.SorobanAuthorizationEntry>;
}

export interface TxSigner {
    getPublicKey(): string | Promise<string>;
    signTxXDR(b64Xdr: string, networkPassphrase: string): Promise<string>;
}
```

*Why?* These let you plug in either **raw `Keypair`** (Node) or **Freighter** (browser) without changing the rest of the flow.

### Node adapters (ready to use)

```typescript
export const keypairAuthSigner = (kp: Keypair): AuthEntrySigner => ({
    getPublicKey: () => kp.publicKey(),
    signAuthEntry: (u, v, p) => authorizeEntry(u, kp, v, p),
});

export const keypairTxSigner = (kp: Keypair): TxSigner => ({
    getPublicKey: () => kp.publicKey(),
    signTxXDR: async (b64, pass) => {
        const tx = TransactionBuilder.fromXDR(b64, pass);
        if (tx instanceof FeeBumpTransaction) tx.innerTransaction.sign(kp);
        else (tx as Transaction).sign(kp);
        return tx.toXDR();
    },
});
```

### Core flow

- **`constructRouterContractOp(...)`** – Backend-only logic. Builds a RouterV1 `invokeContractFunction` op **without auth** and returns `{ opWithoutAuth, routerArgs }`.
- **`simulateAndGetUnsignedCaller(...)`** – Backend simulates a draft transaction to retrieve `required_auth`. Returns `{ unsignedCaller, sim }`.
- **`makeOpWithAuth(...)`** – Frontend asks `AuthEntrySigner` (user) to sign the **SorobanAuthorizationEntry**, then returns the same op with `auth` populated.
- **`submitOpWithAuthToRelayer(...)`** – Backend assembles resource footprint and fees using `sim`, asks `TxSigner` (payer) to sign the **transaction XDR**, then sends and polls.

### Helpers

- **`estimateGasXlm()`** – demo gas heuristic (`2 * BASE_FEE`). Replace with a real estimator.
- **`estimateMaxUsdcForGas({ margin, estimatedGasXlm, rateXlmToUsdc })`** – converts the gas target to a **max USDC in** for the swap.
- **Invocation builders**:
    - `buildInvocation_UsdcTransfer(from, to, amount)`
    - `buildInvocation_UsdcSwapXlm(amount_out, amount_in_max, caller, deadline)` (USDC → XLM path)

## Browser usage (Freighter)

If you don’t want to bundle Node `Keypair`s in the browser, implement the signer interfaces with Freighter:

```typescript
import * as freighter from '@stellar/freighter-api';
import { xdr } from '@stellar/stellar-sdk';

const freighterUserSigner: AuthEntrySigner = {
    getPublicKey: () => freighter.getPublicKey(),
    signAuthEntry: async (unsigned, validUntil, passphrase) => {
        // Freighter generally returns base64; convert back to XDR object
        const signedB64 = await freighter.signAuthEntry(unsigned.toXDR('base64'), {
        networkPassphrase: passphrase,
        validUntilLedger: validUntil,
        });
        return xdr.SorobanAuthorizationEntry.fromXDR(signedB64, 'base64');
    },
};

const freighterTxSigner: TxSigner = {
    getPublicKey: () => freighter.getPublicKey(),
    signTxXDR: (b64, passphrase) => freighter.signTransaction(b64, { networkPassphrase: passphrase }),
};
```

## Configuration & assumptions

- **Contracts** are pinned via IDs in `scripts/sdk.ts` (RouterV1, USDC, XLM wrapper, Soroswap router). Change as needed.
- **Decimals**: the demo uses a scale of `1e7`. Adjust to your tokens’ decimals.
- **Swap safety**: set real `amount_in_max` margins & short deadlines (slippage control).
- **Prereqs**: the user should have USDC balance; relevant trustlines/approvals must exist per your token/router configs.
- **Security**: never hardcode secrets in production; use env or wallet signers. Validate inputs server-side.

## Why RouterV1?

Soroban only allows **one** contract invocation op per transaction. RouterV1 batches multiple contract invocations into a single op so the gas purchase (refund) and user action happen atomically.

## License

MIT


