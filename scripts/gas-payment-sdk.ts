// Stellar Gasless Payments – Tiny Frontend SDK (TypeScript)
// ---------------------------------------------------------
// Goal: help a wallet/app let users send payments without holding XLM upfront.
// The user signs a tx that (1) swaps USDC->XLM for the fee, (2) pays those XLM to the backend, (3) pays USDC to the recipient.
// The app/backend then submits the signed tx on-chain.
//
// Assumptions & notes:
// - We use @stellar/stellar-sdk v12+ (aka "stellar-sdk" on npm). Adjust imports if your version differs.
// - "Gas" in Stellar is the *fee* in stroops per operation; total fee = feePerOp * opsCount.
// - We convert fee to XLM (1 XLM = 10^7 stroops) so op1 can deliver that much XLM using a path payment.
// - USDC is an issued asset you configure via { code: 'USDC', issuer: 'G...' }.
// - For the USDC->XLM swap we use PathPaymentStrictReceive delivering exactly `gasXlm` to the *user* (source) account.
//   Then we send that XLM to your backend address in op2.
// - For a realistic swap you must set a sensible `sendMax` in op1. We provide `quoteGasSwapStrictReceive()` that calls
//   Horizon /paths/strict-receive to estimate the needed USDC.
// - This file focuses on the frontend SDK: estimation, tx construction, and posting to your backend.
// - You will still sign with your wallet lib (e.g. Freighter, Albedo, Ledger, etc.).
//
// Usage:
//   import { MySDK } from './stellar-gasless-payments-sdk';
//   const sdk = new MySDK({
//     horizonUrl: 'https://horizon-testnet.stellar.org',
//     networkPassphrase: Networks.TESTNET,
//     userAddress: 'G...USER',
//     usdc: { code: 'USDC', issuer: 'G...USDC_ISSUER' },
//     endpointSubmitToBackend: 'https://api.example.com/submit',
//     endpointRequestBackendAddress: 'https://api.example.com/backend-address'
//   });
//
//   const gasStroops = await sdk.estimate_gas();
//   const gasXlm = sdk.stroopsToXlm(gasStroops);
//   const backend = await sdk.get_backend_address();
//   const tx = await sdk.construct_tx({
//     gasXlm,
//     usdcAmountToRecipient: '12.5',
//     recipient: 'G...RECIP',
//     backend
//   });
//   // Sign with your wallet:
//   const signedXDR = await wallet.signTx(tx); // or tx.toXDR() -> sign -> return XDR
//   await sdk.send_to_backend(signedXDR);
//
// Types:
// - Address is an alias for string.
// - Tx is stellar-sdk Transaction type (we return a Transaction).

import {
    Horizon,
    Asset,
    Operation,
    TransactionBuilder,
    BASE_FEE,
    Account,
    Networks,
    TimeoutInfinite,
    Transaction
} from '@stellar/stellar-sdk';

export type Address = string;

export interface UsdcAssetConfig {
    code: string; // e.g., 'USDC'
    issuer: Address; // e.g., 'G...'
}

export interface SDKConfig {
    horizonUrl: string;
    networkPassphrase: string; // e.g., Networks.PUBLIC or Networks.TESTNET
    userAddress: Address; // the user's (source) account U
    usdc: UsdcAssetConfig;
    endpointSubmitToBackend: string; // POST endpoint to accept signed tx XDR
    endpointRequestBackendAddress: string; // GET endpoint returning { address: 'G...' }
    // Optional: multiplier buffer added to fee estimate (default 1.2 = +20%)
    feeSafetyMultiplier?: number;
}

export interface ConstructTxArgs {
    gasXlm: string; // amount of XLM to cover fee, as decimal string (e.g., '0.0003')
    usdcAmountToRecipient: string; // decimal string, up to 7 dp
    recipient: Address; // R
    backend: Address; // backend fee-collector address
    // Optional cap on how much USDC we allow to be spent in the path payment swap
    // If omitted, we call quoteGasSwapStrictReceive to compute a reasonable sendMax.
    swapSendMaxUsdc?: string;
}

export class MySDK {
    private readonly cfg: Required<SDKConfig>;
    private readonly server: Horizon.Server;
    private readonly usdc: Asset;

    constructor(cfg: SDKConfig) {
        const feeSafetyMultiplier = cfg.feeSafetyMultiplier ?? 1.2;
        this.cfg = { ...cfg, feeSafetyMultiplier } as Required<SDKConfig>;
        this.server = new Horizon.Server(this.cfg.horizonUrl);
        this.usdc = new Asset(this.cfg.usdc.code, this.cfg.usdc.issuer);
    }

    // --- Fee helpers ---
    public stroopsToXlm(stroops: number): string {
        return (stroops / 1e7).toFixed(7).replace(/0+$/, '').replace(/\.$/, '') || '0';
    }

    public xlmToStroops(xlm: string | number): number {
        const n = typeof xlm === 'string' ? parseFloat(xlm) : xlm;
        return Math.round(n * 1e7);
    }

    /**
     * Estimate the fee in STROOPS for a 3-op transaction, using Horizon /fee_stats p95 and a safety multiplier.
     * Returns an integer stroops value.
     */
    public async estimate_gas(): Promise<number> {
        const stats = await fetch(`${this.cfg.horizonUrl}/fee_stats`).then(r => r.json());
        // Prefer fee_charged.p95 per Stellar guidance; fallback to BASE_FEE.
        const perOp = Number(stats?.fee_charged?.p95 ?? BASE_FEE);
        const ops = 3; // op1 swap, op2 pay XLM to backend, op3 pay USDC to recipient
        const raw = Math.max(perOp, Number(BASE_FEE)) * ops;
        return Math.ceil(raw * this.cfg.feeSafetyMultiplier);
    }

    /** Ask the backend for its collection address. Expected JSON: { address: 'G...' } */
    public async get_backend_address(): Promise<Address> {
        const res = await fetch(this.cfg.endpointRequestBackendAddress);
        if (!res.ok) throw new Error(`Backend address HTTP ${res.status}`);
        const data = await res.json();
        if (!data?.address) throw new Error('Malformed backend address response');
        return data.address as Address;
    }

    /**
     * Query Horizon strict-receive paths to find an estimated USDC send amount to receive `gasXlm` native.
     * Returns a tuple: { sendMaxUsdc, path } where path is an array of Asset-like hops (can be fed into path payment op).
     */
    public async quoteGasSwapStrictReceive(gasXlm: string): Promise<{ sendMaxUsdc: string; path: Asset[] } > {
        const destAsset = Asset.native();
        const params = new URLSearchParams({
            destination_amount: gasXlm,
            destination_assets: `${destAsset.getCode()}:${destAsset.getIssuer() ?? 'native'}`,
            source_account: this.cfg.userAddress
        });
        const url = `${this.cfg.horizonUrl}/paths/strict-receive?${params.toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`paths/strict-receive HTTP ${resp.status}`);
        const json = await resp.json();

        // Find first path that spends USDC directly if possible; else pick the cheapest by source_amount.
        const records: any[] = json?._embedded?.records ?? [];
        if (records.length === 0) throw new Error('No swap path found to deliver gas XLM');

        const parsed = records.map((r) => ({
            sourceAsset: r.source_asset_type === 'credit_alphanum4' || r.source_asset_type === 'credit_alphanum12'
                ? new Asset(r.source_asset_code, r.source_asset_issuer)
                : Asset.native(),
            sourceAmount: r.source_amount as string,
            path: (r.path as any[]).map(p => (
                (p.asset_type === 'native') ? Asset.native() : new Asset(p.asset_code, p.asset_issuer)
            ))
        }));

        // Prefer paths whose source asset is the configured USDC
        const preferUsdc = parsed.filter(p => p.sourceAsset.getCode() === this.usdc.getCode() && p.sourceAsset.getIssuer() === this.usdc.getIssuer());
        const candidates = (preferUsdc.length > 0 ? preferUsdc : parsed)
            .sort((a, b) => parseFloat(a.sourceAmount) - parseFloat(b.sourceAmount));

        const best = candidates[0];
        const sendMaxUsdc = (parseFloat(best.sourceAmount) * 1.02).toFixed(7); // +2% slippage buffer

        // If best source isn't actually USDC, we fall back to no intermediate hops and let op reject. You may enhance here.
        const path = best.path;
        return { sendMaxUsdc, path };
    }

    /**
     * Build the transaction with 3 operations.
     * - op1: PathPaymentStrictReceive( send USDC, deliver gasXlm XLM to user, sendMax from quote or arg )
     * - op2: Payment( XLM, gasXlm, to backend )
     * - op3: Payment( USDC, usdcAmountToRecipient, to recipient )
     * Returns an unsigned Transaction ready to be signed by the user.
     */
    public async construct_tx(args: ConstructTxArgs): Promise<Transaction> {
        const { gasXlm, usdcAmountToRecipient, recipient, backend } = args;

        // Load source account (U)
        const account = await this.server.loadAccount(this.cfg.userAddress);

        // Determine sendMax & path for swap if not provided
        let sendMaxUsdc = args.swapSendMaxUsdc;
        let path: Asset[] = [];
        if (!sendMaxUsdc) {
            const q = await this.quoteGasSwapStrictReceive(gasXlm);
            sendMaxUsdc = q.sendMaxUsdc;
            path = q.path;
        }

        const txb = new TransactionBuilder(account, {
            fee: String(await this.suggestPerOpFee()), // per-op fee; sdk multiplies by ops count
            networkPassphrase: this.cfg.networkPassphrase
        })
            // op1: swap USDC -> XLM, destination = userAddress (deliver gasXlm)
            .addOperation(Operation.pathPaymentStrictReceive({
                sendAsset: this.usdc,
                sendMax: sendMaxUsdc!,
                destination: this.cfg.userAddress,
                destAsset: Asset.native(),
                destAmount: gasXlm,
                path
            }))
            // op2: pay the freshly received XLM to backend
            .addOperation(Operation.payment({
                destination: backend,
                asset: Asset.native(),
                amount: gasXlm
            }))
            // op3: pay USDC to recipient
            .addOperation(Operation.payment({
                destination: recipient,
                asset: this.usdc,
                amount: usdcAmountToRecipient
            }))
            .setTimeout(TimeoutInfinite)
            .build();

        return txb;
    }

    /** POST signed XDR to your backend */
    public async send_to_backend(signed: Transaction | string): Promise<void> {
        const xdr = typeof signed === 'string' ? signed : signed.toXDR();
        const res = await fetch(this.cfg.endpointSubmitToBackend, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ xdr })
        });
        if (!res.ok) throw new Error(`submit_to_backend HTTP ${res.status}`);
    }

    // --- Internals ---
    private async suggestPerOpFee(): Promise<string> {
        try {
            const stats = await fetch(`${this.cfg.horizonUrl}/fee_stats`).then(r => r.json());
            const perOp = Number(stats?.fee_charged?.p95 ?? BASE_FEE);
            const withBuffer = Math.ceil(perOp * this.cfg.feeSafetyMultiplier);
            return String(withBuffer);
        } catch {
            return String(BASE_FEE);
        }
    }
}

// Convenience factory so you can do: const mySDK = new MySDK({...})
export default MySDK;

// ---------------------------------------------------------
// Soroban: RouterV1.exec helper (single InvokeContract op)
// ---------------------------------------------------------
// This wrapper builds a single InvokeHostFunction transaction that calls
// RouterV1.exec(caller: Address, invocations: Vec<(Address, Symbol, Vec<Val>, bool)>)
// and prepares it (simulation + footprint) so the user can just sign & you can submit.

import {
    Soroban,
    Contract,
    nativeToScVal,
    xdr,
    rpc,
    Address as SorobanAddress,
} from '@stellar/stellar-sdk';

export type ScVal = xdr.ScVal;
export interface RouterInvocation {
    contractId: string;      // hex string (e.g., 'ccf...')
    method: string;          // Soroban function name (Symbol)
    args: ScVal[];           // pre-encoded ScVals
    canFail: boolean;        // if true, Router will push error Val instead of reverting
}

// Handy encoders for common arg types
export const S = {
    account: (g: string) => xdr.ScVal.scvAddress(SorobanAddress.fromString(g).toScAddress()),
    contract: (idHex: string) => xdr.ScVal.scvAddress(SorobanAddress.contract(Buffer.from(Uint8Array.from(idHex))).toScAddress()),
    addr: (a: string) => xdr.ScVal.scvAddress(SorobanAddress.fromString(a).toScAddress()),
    sym: (s: string) => xdr.ScVal.scvSymbol(s),
    str: (s: string) => nativeToScVal(s, { type: 'string' }),
    u32: (n: number | string) => nativeToScVal(BigInt(n), { type: 'u32' }),
    u64: (n: bigint | number | string) => nativeToScVal(BigInt(n), { type: 'u64' }),
    i128: (n: bigint | number | string) => nativeToScVal(BigInt(n), { type: 'i128' }),
    u128: (n: bigint | number | string) => nativeToScVal(BigInt(n), { type: 'u128' }),
    bool: (b: boolean) => nativeToScVal(b, { type: 'bool' }),
    bytes: (u: Uint8Array) => nativeToScVal(u, { type: 'bytes' }),
    vec: (vals: xdr.ScVal[]) => xdr.ScVal.scvVec(vals),
};

export interface RouterExecCfg {
    rpcUrl: string;                 // Soroban RPC endpoint
    networkPassphrase: string;      // e.g., Networks.FUTURENET or TESTNET
    contractId: string;             // RouterV1 contract ID (hex)
    caller: string;                 // G... address that must require_auth in Router
    sourceAccount?: string;         // optional: source account for the tx (defaults to caller)
}

/**
 * Build a PREPARED transaction (with footprint & auth) for RouterV1.exec.
 * Return value is ready to sign by the caller (and any other required signers) and send.
 */
export async function buildRouterExecTx(
    cfg: RouterExecCfg,
    invocations: RouterInvocation[],
): Promise<Transaction> {
    const server = new rpc.Server(cfg.rpcUrl, { allowHttp: cfg.rpcUrl.startsWith('http://') });

    // Load classic account to get a fresh sequence
    const acct = await server.getAccount(cfg.sourceAccount ?? cfg.caller);
    const source = new Account(acct.accountId(), acct.sequenceNumber());

    const contract = new Contract(cfg.contractId);

    // Encode invocations: Vec<(Address, Symbol, Vec<Val>, bool)>
    const invVec = xdr.ScVal.scvVec(
        invocations.map((iv) =>
            xdr.ScVal.scvVec([
                S.contract(iv.contractId),
                S.sym(iv.method),
                S.vec(iv.args),
                S.bool(iv.canFail),
            ])
        )
    );

    // Draft tx (auth empty). We simulate to learn auth entries.
    const invokeOpDraft = Operation.invokeContractFunction({
        contract: cfg.contractId,
        function: 'exec',
        args: [ S.account(cfg.caller), invVec ],         // invVec = xdr.ScVal.scvVec([...]) per earlier
        auth: [],                                        // empty for draft; fill after simulate()
    });
    const draft = new TransactionBuilder(source, {
        fee: String(BASE_FEE),
        networkPassphrase: cfg.networkPassphrase,
    })
        .addOperation(invokeOpDraft)
        .setTimeout(30)
        .build();

    const sim = await server.simulateTransaction(draft);
    if (rpc.Api.isSimulationError(sim)) {
        throw new Error('Simulation failed: ' + JSON.stringify(sim, null, 2));
    }

    const auth = sim.result?.auth ?? [];
    const invokeOp = Operation.invokeContractFunction({
        contract: cfg.contractId,
        function: 'exec',
        args: [ S.account(cfg.caller), invVec ],         // invVec = xdr.ScVal.scvVec([...]) per earlier
        auth,                                        // empty for draft; fill after simulate()
    });
    // Build again with auth and prepare (adds footprint and min resource fees)
    let tx = new TransactionBuilder(source, {
        fee: String(BASE_FEE),
        networkPassphrase: cfg.networkPassphrase,
    })
        .addOperation(invokeOp)
        .setTimeout(30)
        .build();

    tx = await server.prepareTransaction(tx);
    return tx;
}

export async function sendPreparedTx(rpcUrl: string, tx: Transaction) {
    const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
    const res = await server.sendTransaction(tx);
    if (res.status !== 'PENDING') {
        throw new Error('sendTransaction failed: ' + JSON.stringify(res));
    }
    return res;
}

// Example (pseudo)
// const tx = await buildRouterExecTx({
//   rpcUrl: 'https://rpc-futurenet.stellar.org:443',
//   networkPassphrase: Networks.FUTURENET,
//   contractId: 'ccf...ROUTER',
//   caller: 'G...USER',
// }, [
//   { contractId: 'ccf...USDC', method: 'transfer', args: [S.addr('G...USER'), S.addr('G...RECIP'), S.i128('2500000')], canFail: false },
// ]);
// // sign with wallet (caller must sign to satisfy require_auth)
// const signed = await wallet.signSorobanTx(tx);
// const res = await sendPreparedTx('https://rpc-futurenet.stellar.org:443', signed);

async function main(): Promise<void> {
    const usdcContractAddress = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
    const bob = 'GCCY4JAL7EALEYRAOQT2AKICOIS33RKJ5DDLTL3SAIGSCVXEMVJESNGF';

    const tx = await buildRouterExecTx({
       rpcUrl: 'https://soroban-testnet.stellar.org:443',
       networkPassphrase: Networks.TESTNET,
       contractId: process.env.GAS_ROUTER_SMART_CONTRACT_ID!,
       caller: bob,
     }, [
       { contractId: 'ccf...USDC', method: 'transfer', args: [S.addr('G...USER'), S.addr('G...RECIP'), S.i128('2500000')], canFail: false },
     ]);

    // sign with wallet (caller must sign to satisfy require_auth)
    const signed = await wallet.signSorobanTx(tx);
    const res = await sendPreparedTx('https://rpc-futurenet.stellar.org:443', signed);
}