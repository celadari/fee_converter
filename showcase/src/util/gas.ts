import { randomBytes } from 'crypto';
import {
    Address,
    BASE_FEE,
    Keypair,
    Networks,
    Operation,
    TransactionBuilder,
    authorizeEntry,
    nativeToScVal,
    xdr,
    rpc, Horizon, Asset, Transaction, FeeBumpTransaction,
} from '@stellar/stellar-sdk';

// ---------- Config ----------
const rpcUrl = 'https://soroban-testnet.stellar.org';
const networkPassphrase = Networks.TESTNET;
const server = new rpc.Server(rpcUrl);

// ---------- Secrets ----------
//const backendKeypair = Keypair.fromSecret('GACITQZ7I4CQU5YLMWV4F274NVZJ2RSP6NISYJSYBK47D2IONAL26MBH'); // fee payer / sourceAccount
//const userKeyPair    = Keypair.fromSecret('GCCY4JAL7EALEYRAOQT2AKICOIS33RKJ5DDLTL3SAIGSCVXEMVJESNGF');    // caller that must require_auth
//const recipientKeypair       = Keypair.fromSecret('GAQREXOUVV6XLQAWHZ3CMMZPMQJ5QDIWU2DWP4CDDTTIFHUPZPJEFFRJ');
const backendKeypair = Keypair.fromSecret('SCUK4TJBBSKZVOS3ELZGRNGDYEGISJKMIN2KOY6E5XS6JXBQNUKYNGRO');
const userKeyPair    = Keypair.fromSecret('SDJH3Q25A66PT27RSI2S2TPB6LJ72BZXOFUZU6TK72OW5A77EMLR57AA');
const recipientKeypair       = Keypair.fromSecret('SCQYME5TXWWFQDBFJ2N3RPCHEUANSAUHCHJHOAELPCGHCD6TXV33NUNY');

// ---------- Contracts / addrs ----------
const ROUTER_CONTRACT_ID      = 'CCNXMLQRLAAZ5MGK5HXMWFDZEU6SE67Y5CHI3QTKXIGY46PUU5NJJZS5';       // C...
const USDC_TOKEN_CONTRACT_ID  = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';   // C...
const USDC_ISSUER             = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC_CODE               = 'USDC';
const XLM_TOKEN_CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

const SOROSWAP_ROUTER_ID      = 'CCMAPXWVZD4USEKDWRYS7DA4Y3D7E2SDMGBFJUCEXTC7VN6CUBGWPFUS';

const SCALE = 10 ** 7;

const RATE_XLM_TO_USDC = 0.4;
const XLM_EXTRA_MARGIN = 0.001

// Soroban token amounts are often i128; if your token uses u64, keep u64 like below
const AMOUNT = BigInt(10_000); // u64 example (e.g., 0.10 USDC with 6 dp)

// ---------- Build ScVals ----------
const scAddr = (a: string) => new Address(a).toScVal();
const scSym  = (s: string) => xdr.ScVal.scvSymbol(s);
const scVec  = (vals: xdr.ScVal[]) => xdr.ScVal.scvVec(vals);

// Build one invocation tuple: (Address contract, Symbol method, Vec<Val> args, bool can_fail)
function buildInvocation_UsdcTransfer(fromG: string, toG: string, amount: bigint): xdr.ScVal {
    // If your token expects i128, switch to: nativeToScVal(amount, { type: 'i128' })
    const args = scVec([ scAddr(fromG), scAddr(toG), nativeToScVal(amount, { type: 'i128' }) ]);
    return scVec([
        scAddr(USDC_TOKEN_CONTRACT_ID), // contract (Address)
        scSym('transfer'),              // method (Symbol)
        args,                           // args (Vec<Val>)
        xdr.ScVal.scvBool(false),       // can_fail = false
    ]);
}

function buildInvocation_UsdcSwapXlm(amount_out: number, amount_in_max: number, callerG: string, deadline: number): xdr.ScVal {
    const args = scVec([
        nativeToScVal(amount_out, { type: 'i128' }),                 // amount_out (i128)
        nativeToScVal(amount_in_max, { type: 'i128' }),                   // amount_out_min (i128)
        xdr.ScVal.scvVec([          // path: Vec<Address> = [USDC, XLM]
            Address.fromString(USDC_TOKEN_CONTRACT_ID).toScVal(),
            Address.fromString(XLM_TOKEN_CONTRACT_ID).toScVal(),
        ]),
        Address.fromString(callerG).toScVal(),                // to
        nativeToScVal(deadline, { type: "u64" }),        // deadline (unix seconds)
    ]);
    return scVec([
        scAddr(SOROSWAP_ROUTER_ID), // contract (Address)
        scSym('swap_tokens_for_exact_tokens'),              // method (Symbol)
        args,                           // args (Vec<Val>)
        xdr.ScVal.scvBool(false),       // can_fail = false
    ]);
}

// Create a trustline for user G... to classic asset (code, issuer) with sponsorship by backend
async function sponsorAndCreateTrustline(opts: {
    horizonUrl: string;              // 'https://horizon-testnet.stellar.org'
    networkPassphrase: string;       // Networks.TESTNET
    backend: Keypair;                // sponsor (pays reserves)
    userPub: string;                 // G... user (caller)
    userSigner: (xdr: string) => Promise<string>; // function that returns user-signed XDR (e.g., Freighter signTransaction)
    code: string;                    // 'USDC'
    issuer: string;                  // G... USDC issuer
}) {
    const horizon = new Horizon.Server(opts.horizonUrl);
    const sponsorPub = opts.backend.publicKey();
    const asset = new Asset(opts.code, opts.issuer);

    // Build a classic tx with sponsorship:
    // 1) begin sponsoring future reserves (source: backend)
    // 2) changeTrust (source: user)
    // 3) end sponsoring (source: user)
    const sponsorAccount = await horizon.loadAccount(sponsorPub);

    const tx = new TransactionBuilder(sponsorAccount, {
        fee: BASE_FEE,                         // string OK here
        networkPassphrase: opts.networkPassphrase,
    })
        .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: opts.userPub }))
        .addOperation(Operation.changeTrust({ asset, source: opts.userPub }))
        .addOperation(Operation.endSponsoringFutureReserves({ source: opts.userPub }))
        .setTimeout(120)
        .build();

    // 1) sponsor signs
    tx.sign(opts.backend);

    // 2) user signs (via wallet)
    const userSignedXdr = await opts.userSigner(tx.toXDR());
    const fullySigned = TransactionBuilder.fromXDR(userSignedXdr, opts.networkPassphrase);

    // 3) submit via Horizon
    try {
        const res = await horizon.submitTransaction(fullySigned);
        console.log('ok', res.hash);
        return res;
    } catch (e: any) {
        const ex = e?.response?.data?.extras;
        if (!ex) throw e;

        console.error('tx code:', ex.result_codes?.transaction);   // e.g. tx_bad_auth, tx_bad_seq, tx_failed
        console.error('op codes:', ex.result_codes?.operations);   // e.g. op_low_reserve, op_no_trust, op_already_exists
        console.error('result_xdr:', ex.result_xdr);

        // Optional: decode the result XDR to inspect which op index failed
        const tr = xdr.TransactionResult.fromXDR(ex.result_xdr, 'base64');
        console.error('decoded:', tr.result().switch().name, tr.result().value());
    }
}

export async function GasolinaMain() {
    const callerG  = userKeyPair.publicKey();     // the user/actor (must require_auth)
    const payerG   = backendKeypair.publicKey();  // fee payer / sourceAccount
    const recipientG= recipientKeypair.publicKey();
    console.log(`callerG: ${callerG}`);
    console.log(`payerG: ${payerG}`);
    console.log(`recipientG: ${recipientG}`);


    // ONLY ONCE
    // caller trustline
    //await sponsorAndCreateTrustline({
    //    horizonUrl: 'https://horizon-testnet.stellar.org',
    //    networkPassphrase,
    //    backend: backendKeypair,     // sponsor/payer
    //    userPub: callerG,            // G... of the user
    //    userSigner: async (xdr: string): Promise<string> => {
    //        // Re-hydrate the tx from XDR
    //        const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
//
    //        // If it’s a fee bump, sign the inner tx; else sign the tx directly
    //        if (tx instanceof FeeBumpTransaction) {
    //            tx.innerTransaction.sign(userKeyPair);
    //            return tx.toXDR();
    //        } else {
    //            tx.sign(userKeyPair);
    //            return tx.toXDR();
    //        }
//
    //        // If you prefer to ignore fee-bumps during testing:
    //         (tx as any).sign(userKeyPair); return (tx as any).toXDR();
    //    },
//
    //    code: USDC_CODE,
    //    issuer: USDC_ISSUER,
    //});
    // recipient trustline (if needed)
    //await sponsorAndCreateTrustline({
    //    horizonUrl: 'https://horizon-testnet.stellar.org',
    //    networkPassphrase,
    //    backend: backendKeypair,
    //    userPub: recipientG,
    //    userSigner: async (xdr: string): Promise<string> => {
    //        // Re-hydrate the tx from XDR
    //        const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
//
    //        // If it’s a fee bump, sign the inner tx; else sign the tx directly
    //        if (tx instanceof FeeBumpTransaction) {
    //            tx.innerTransaction.sign(recipientKeypair);
    //            return tx.toXDR();
    //        } else {
    //            tx.sign(recipientKeypair);
    //            return tx.toXDR();
    //        }
//
    //        // If you prefer to ignore fee-bumps during testing:
    //        (tx as any).sign(userKeyPair); return (tx as any).toXDR();
    //    },
//
    //    code: USDC_CODE,
    //    issuer: USDC_ISSUER,
    //});

    // >>>>> FRONTEND

    const amountOutXlm = 2 * Number(BASE_FEE); // e.g. 200/1e7 = 0.0000200
    const amountInMaxUsdc = Math.ceil((amountOutXlm * RATE_XLM_TO_USDC + XLM_EXTRA_MARGIN) * SCALE);
    const HUNDRED_YEARS = (365 * 24 * 60 * 60);
    const DEADLINE_FOREVER = 32_503_680_000;
// 3) “forever” deadline (no timeout)
    const DEADLINE_FOR_EVER = 0;

    // --- Router.exec args ---
    // exec(caller: Address, invocations: Vec<(Address, Symbol, Vec<Val>, bool)>)
    const invocationsVec = scVec([
        buildInvocation_UsdcTransfer(callerG, recipientG, AMOUNT),
        buildInvocation_UsdcSwapXlm(amountOutXlm, amountInMaxUsdc, callerG, DEADLINE_FOREVER)
    ]);

    const routerArgs: xdr.ScVal[] = [
        scAddr(callerG),     // caller
        invocationsVec,      // invocations Vec
    ];

    // ---------- 1) Build op WITHOUT auth ----------
    const opWithoutAuth = Operation.invokeContractFunction({
        contract: ROUTER_CONTRACT_ID,
        function: 'exec',
        args: routerArgs,
    });
    // action:   FRONTEND sends opWithoutAuth -> BACKEND

    // >>>>> BACKEND

    // Build tx with payer (backend) as sourceAccount (sequence + fees)
    const payerAccount = await server.getAccount(payerG);
    const draftTx = new TransactionBuilder(payerAccount, {
        fee: BASE_FEE,
        networkPassphrase,
    })
        .addOperation(opWithoutAuth)
        .setTimeout(60)
        .build();

    // ---------- 2) Simulate to learn required auths ----------
    const sim = await server.simulateTransaction(draftTx);
    if ('error' in sim) throw new Error(sim.error);

    // Find the unsigned entries for the caller (user) and for the sourceAccount (payer)
    const unsignedCaller = sim.result?.auth.find(cred =>
        Address.fromScAddress(cred.credentials().address().address()).toString() === callerG
    );

    // Both may be required depending on your contract flow.
    if (!unsignedCaller) throw new Error('Missing caller auth requirement in simulation result');

    // action: BACKEND sends unsignedCaller -> FRONTEND

    // >>>>> FRONTEND

    // ---------- 3) Sign the AUTH entries (not the op itself) ----------
    const latest = await server.getLatestLedger();
    const validUntil = latest.sequence + 1000; // ledger seq horizon for auth validity

    const signedAuth: xdr.SorobanAuthorizationEntry[] = [];
    signedAuth.push(await authorizeEntry(unsignedCaller, userKeyPair, validUntil, networkPassphrase));

    // ---------- 4) Build the SAME op WITH signed auth ----------
    const opWithAuth = Operation.invokeContractFunction({
        contract: ROUTER_CONTRACT_ID,
        function: 'exec',
        args: routerArgs,
        auth: signedAuth,
    });
    // action:   FRONTEND sends opWithAuth -> BACKEND

    // >>>>> BACKEND

    const payerAccount2 = await server.getAccount(payerG);
    const needsFootprint = new TransactionBuilder(payerAccount2, {
        fee: BASE_FEE,
        networkPassphrase,
    })
        .addOperation(opWithAuth)
        .setTimeout(60)
        .build();

    // ---------- 5) Add resource footprint + resource fees ----------
    const prepared = rpc.assembleTransaction(needsFootprint, sim).build();

    // ---------- 6) Sign the TRANSACTION (payer) and submit ----------
    prepared.sign(backendKeypair); // backend pays -> must sign tx
    const send = await server.sendTransaction(prepared);
    console.log('send status:', send.status, 'hash:', send.hash);

    // ---------- 7) Poll until confirmed ----------
    const final = await server.pollTransaction(send.hash, { attempts: 30 });
    console.log('final status:', final.status);
}