# KwickBit Payment Processor – Soroban Smart Contract

This repository contains all necessary code, scripts, and CI configuration to **deploy and manage the KwickBit Payment Processor smart contract on Stellar Soroban** across both **Testnet** and **Mainnet**.

---

## Contents

- `src/lib.rs`  
  Main Soroban contract (with royalty, ERC-20 support, and approvals).
- `scripts/pay_through_payment_processor.ts`  
  TypeScript script that triggers the smart contract to make a payment.
- `.github/workflows/...`  
  GitHub Actions for multi-network deployment and contract address export to Google Secret Manager.
- `.github/actions/deploy-soroban-contract-and-export-sc-address/`  
  Composite GitHub Action to deploy + export the deployed address as GCP secrets.

  
```typescript
// ONLY ONCE
     caller trustline
    await sponsorAndCreateTrustline({
        horizonUrl: 'https://horizon-testnet.stellar.org',
        networkPassphrase,
        backend: backendKeypair,     // sponsor/payer
        userPub: callerG,            // G... of the user
        userSigner: async (xdr: string): Promise<string> => {
            // Re-hydrate the tx from XDR
            const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);

            // If it’s a fee bump, sign the inner tx; else sign the tx directly
            if (tx instanceof FeeBumpTransaction) {
                tx.innerTransaction.sign(userKeyPair);
                return tx.toXDR();
            } else {
                tx.sign(userKeyPair);
                return tx.toXDR();
            }

            // If you prefer to ignore fee-bumps during testing:
             (tx as any).sign(userKeyPair); return (tx as any).toXDR();
        },

        code: USDC_CODE,
        issuer: USDC_ISSUER,
    });
     recipient trustline (if needed)
    await sponsorAndCreateTrustline({
        horizonUrl: 'https://horizon-testnet.stellar.org',
        networkPassphrase,
        backend: backendKeypair,
        userPub: recipientG,
        userSigner: async (xdr: string): Promise<string> => {
            // Re-hydrate the tx from XDR
            const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);

            // If it’s a fee bump, sign the inner tx; else sign the tx directly
            if (tx instanceof FeeBumpTransaction) {
                tx.innerTransaction.sign(recipientKeypair);
                return tx.toXDR();
            } else {
                tx.sign(recipientKeypair);
                return tx.toXDR();
            }

            // If you prefer to ignore fee-bumps during testing:
            (tx as any).sign(userKeyPair); return (tx as any).toXDR();
        },

        code: USDC_CODE,
        issuer: USDC_ISSUER,
    });
```


---

## Prerequisites for Local Development

1. **Install system dependencies**

```sh
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  pkg-config \
  libudev-dev \
  libdbus-1-dev \
  libhidapi-dev
```

2. **Install Rust (right version)**

```sh
rustup self update
rustup toolchain install 1.89.0
rustup default 1.89.0
```

3. **Install Rust target dependencies**

```sh
rustup target add wasm32-unknown-unknown
rustup target add wasm32v1-none
```

4. **Install stellar-cli**

```sh
cargo install --locked stellar-cli
```

---

## Get USDC Contract Address

- **Mainnet:**  
  `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75`  
  <https://stellar.expert/explorer/public/contract/CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75>

- **Testnet:**  
  `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`  
  <https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA>

```sh
USDC_TOKEN_CONTRACT_ID=...
```

---

## Import Keys

1. Fetch keys from Proton Safe `Super secret - Charly and Tommy`:
    - Admin Stellar – KwickBit [public only]
    - Royalty Recipient Stellar – KwickBit [public only]
    - Approver Stellar – KwickBit [secret]
    - Deployer Stellar – KwickBit [secret]

2. Import them using `stellar-cli`:

```sh
stellar keys add --public-key <PUBLIC_KEY_ADMIN> admin
stellar keys add --public-key <PUBLIC_KEY_RECIPIENT> recipient
```

```sh
stellar keys add --secret-key <APPROVER_SECRET> approver
stellar keys add --secret-key <DEPLOYER_SECRET> deployer
```

3. Generate merchant and payer accounts (testnet only):

```sh
stellar keys generate merchant --network testnet --fund
stellar keys generate payer --network testnet --fund
```

4. Export addresses and secrets:

```sh
MERCHANT_ADDRESS=$(stellar keys public-key merchant)
ADMIN_ADDRESS=$(stellar keys public-key admin)
APPROVER_ADDRESS=$(stellar keys public-key approver)
RECIPIENT_ADDRESS=$(stellar keys public-key recipient)
```

```sh
APPROVER_SECRET=$(stellar keys secret approver)
PAYER_SECRET=$(stellar keys secret payer)
DEPLOYER_SECRET=$(stellar keys secret deployer)
```

5. Verify:

```sh
stellar keys ls
```

---

## Add USDC Trustline (merchant & payer)

```sh
stellar tx new change-trust \
  --network testnet \
  --source-account merchant \
  --line USDC:$USDC_TOKEN_CONTRACT_ID \
  --build-only \
  | stellar tx sign --network testnet --sign-with-key merchant \
  | stellar tx send --network testnet
```

```sh
stellar tx new change-trust \
  --network testnet \
  --source-account payer \
  --line USDC:$USDC_TOKEN_CONTRACT_ID \
  --build-only \
  | stellar tx sign --network testnet --sign-with-key payer \
  | stellar tx send --network testnet
```

---

## Fund USDC (testnet only)

Use the Circle faucet: <https://faucet.circle.com/>

---

## Get Contract Address

**Option A (Recommended):**  
Fetch from GCP Secret Manager in environment `kb-cloud-env-dev`:
- `ADDRESS_STELLAR_TESTNET_PAYMENT_PROCESSOR`
- `ADDRESS_STELLAR_MAINNET_PAYMENT_PROCESSOR`

```sh
CONTRACT_ID=...
```

**Option B (Not recommended):**  
Deploy locally (see deployment section below).

---

## Build the Contract

```sh
stellar contract build
```

---

## Deployment

### A) Recommended: CI/CD

Deployment is automated via GitHub Actions:
- Choose environment (`dev`, `staging`, `prod`)
- Select network (`testnet`, `mainnet`)
- Contract is built, deployed, and address exported to Google Secret Manager

### B) Local Development Only

1. **Deploy**

```sh
stellar contract deploy \
  --wasm target/wasm32v1-none/release/kwickbit_payment_processor.wasm \
  --network testnet \
  --alias "kwickbit_contract_testnet" \
  --source-account $DEPLOYER_SECRET
DEPLOYED_SMART_CONTRACT_ID=$(stellar contract alias show "kwickbit_contract_testnet"   --network testnet | tail -n1)
echo "Deployed contract ID: $DEPLOYED_SMART_CONTRACT_ID"
```

2. **Initialize**

```sh
stellar contract invoke \
  --id $DEPLOYED_SMART_CONTRACT_ID \
  --source-account deployer \
  --network testnet \
  -- \
  init \
  --admin "$ADMIN_ADDRESS" \
  --approver "$APPROVER_ADDRESS" \
  --royalty-bps 200 \
  --royalty-recipient "$RECIPIENT_ADDRESS"
```

---

## Interact with the Contract

Before interacting, make sure dependencies are installed:

```sh
pnpm install
pnpm run pay-with-kwickbit
```

This runs `scripts/pay_through_payment_processor.ts`, which executes a payment through the deployed Soroban smart contract.