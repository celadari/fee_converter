import {
    Address,
    authorizeEntry,
    BASE_FEE, FeeBumpTransaction,
    Keypair,
    nativeToScVal,
    Networks,
    Operation,
    rpc,
    TransactionBuilder,
    xdr,
    Transaction,
} from '@stellar/stellar-sdk';

type SimulateTransactionResponse = rpc.Api.SimulateTransactionResponse;

// ───────────────────────────────────────────────────────────────────────────────
// Network / server
// ───────────────────────────────────────────────────────────────────────────────
const rpcUrl = 'https://soroban-testnet.stellar.org';
const networkPassphrase = Networks.TESTNET;
const server = new rpc.Server(rpcUrl);

// ───────────────────────────────────────────────────────────────────────────────
// Contracts / addrs
// ───────────────────────────────────────────────────────────────────────────────
const ROUTER_CONTRACT_ID      = 'CCNXMLQRLAAZ5MGK5HXMWFDZEU6SE67Y5CHI3QTKXIGY46PUU5NJJZS5';       // C...
const USDC_TOKEN_CONTRACT_ID  = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';   // C...
const XLM_TOKEN_CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const SOROSWAP_ROUTER_ID      = 'CCMAPXWVZD4USEKDWRYS7DA4Y3D7E2SDMGBFJUCEXTC7VN6CUBGWPFUS';

// ───────────────────────────────────────────────────────────────────────────────
// Generic signer interfaces
// ───────────────────────────────────────────────────────────────────────────────
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
    /** Returns a signed base64 XDR for the given transaction XDR */
    signTxXDR(b64Xdr: string, networkPassphrase: string): Promise<string>;
}

// Handy adapters for Node (raw Keypair)
export const keypairAuthSigner = (kp: Keypair): AuthEntrySigner => ({
    getPublicKey: () => kp.publicKey(),
    signAuthEntry: (u, v, p) => authorizeEntry(u, kp, v, p),
});

export const keypairTxSigner = (kp: Keypair): TxSigner => ({
    getPublicKey: () => kp.publicKey(),
    signTxXDR: async (b64, pass) => {
        const tx = TransactionBuilder.fromXDR(b64, pass);
        if (tx instanceof FeeBumpTransaction) {
            tx.innerTransaction.sign(kp);
        } else {
            (tx as Transaction).sign(kp);
        }
        return tx.toXDR();
    },
});



// ───────────────────────────────────────────────────────────────────────────────
// ScVal helpers
// ───────────────────────────────────────────────────────────────────────────────
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



async function estimateGasXlm(): Promise<number> {
    return 2 * Number(BASE_FEE);
}

async function estimateMaxUsdcForGas({margin, estimatedGasXlm, rateXlmToUsdc}: {margin: number, estimatedGasXlm: number, rateXlmToUsdc: number}): Promise<number> {
    const SCALE = 10 ** 7;
    return Math.ceil((estimatedGasXlm * rateXlmToUsdc + margin) * SCALE);
}


// ───────────────────────────────────────────────────────────────────────────────
// 1) BACKEND (pure logic; no signing) – build the router operation
// ───────────────────────────────────────────────────────────────────────────────
async function constructRouterContractOp({
                                                callerG,
                                                recipientG,
                                                amount,
                                                estimatedGas,
                                                estimatedMaxUsdcForGas,
                                            }
                                                : {
                                                callerG: string,
                                                recipientG: string,
                                                amount: bigint,
                                                estimatedGas: number,
                                                estimatedMaxUsdcForGas: number,
                                            }) {
    // deadline parameter in soroswap contract invocation, we put huge deadline here for sake of hackathon
    const DEADLINE_FOREVER = 32_503_680_000;

    const invocationsVec = scVec([
        buildInvocation_UsdcTransfer(callerG, recipientG, amount),
        buildInvocation_UsdcSwapXlm(estimatedGas, estimatedMaxUsdcForGas, callerG, DEADLINE_FOREVER)
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

    return {opWithoutAuth, routerArgs};
}

// ───────────────────────────────────────────────────────────────────────────────
// 2) BACKEND – simulate and extract unsigned caller auth
//    (payer is provided generically via TxSigner)
// ───────────────────────────────────────────────────────────────────────────────
async function simulateAndGetUnsignedCaller({callerG, payerSigner, opWithoutAuth
                                                }: {callerG: string, payerSigner: TxSigner, opWithoutAuth: xdr.Operation}
    ) {
    const payerG = await payerSigner.getPublicKey();
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
    return {unsignedCaller, sim};
}


// ───────────────────────────────────────────────────────────────────────────────
// 3) FRONTEND – sign the Soroban auth entry using a generic AuthEntrySigner
// ───────────────────────────────────────────────────────────────────────────────
async function makeOpWithAuth({unsignedCaller, routerArgs, routerContractId, userSigner}: {routerContractId: string, unsignedCaller: xdr.SorobanAuthorizationEntry, routerArgs: xdr.ScVal[], userSigner: AuthEntrySigner}) {
    const latest = await server.getLatestLedger();
    const validUntil = latest.sequence + 1000; // ledger seq horizon for auth validity

    const signedAuth = await userSigner.signAuthEntry(unsignedCaller, validUntil, networkPassphrase);

    // ---------- 4) Build the SAME op WITH signed auth ----------
    return Operation.invokeContractFunction({
        contract: routerContractId,
        function: 'exec',
        args: routerArgs,
        auth: [signedAuth],
    });
}


async function submitOpWithAuthToRelayer({payerSigner, opWithAuth, sim
                                         }: {payerSigner: TxSigner, opWithAuth: xdr.Operation, sim: SimulateTransactionResponse}
) {
    const payerG = await payerSigner.getPublicKey();
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
    // Let the generic signer sign the TX XDR
    const signedB64 = await payerSigner.signTxXDR(prepared.toXDR(), networkPassphrase);
    const signedTx = TransactionBuilder.fromXDR(signedB64, networkPassphrase);
    const send = await server.sendTransaction(signedTx);
    console.log('send status:', send.status, 'hash:', send.hash);

    // ---------- 7) Poll until confirmed ----------
    const final = await server.pollTransaction(send.hash, { attempts: 30 });
    console.log('final status:', final.status);
}


async function main() {
    const AMOUNT = BigInt(10_000); // u64 example (e.g., 0.10 USDC with 6 dp)
    const RATE_XLM_TO_USDC = 0.4;
    const XLM_EXTRA_MARGIN = 0.001;

    // Replace these with your own source of keys or other signer impls
    const backendKP = Keypair.fromSecret('SCUK4TJBBSKZVOS3ELZGRNGDYEGISJKMIN2KOY6E5XS6JXBQNUKYNGRO');
    const userKP = Keypair.fromSecret('SDJH3Q25A66PT27RSI2S2TPB6LJ72BZXOFUZU6TK72OW5A77EMLR57AA');
    const recipientKP = Keypair.fromSecret('SCQYME5TXWWFQDBFJ2N3RPCHEUANSAUHCHJHOAELPCGHCD6TXV33NUNY');

    const payerSigner = keypairTxSigner(backendKP);
    const userSigner = keypairAuthSigner(userKP);

    const callerG = await userSigner.getPublicKey();
    const payerG = await payerSigner.getPublicKey();
    const recipientG = recipientKP.publicKey();

    console.log(`callerG: ${callerG}`);
    console.log(`payerG: ${payerG}`);
    console.log(`recipientG: ${recipientG}`);


    // >>>>> FRONTEND

    const estimatedGas = await estimateGasXlm();
    const estimatedMaxUsdcForGas = await estimateMaxUsdcForGas({
        estimatedGasXlm: estimatedGas,
        margin: XLM_EXTRA_MARGIN,
        rateXlmToUsdc: RATE_XLM_TO_USDC,
    });

    const {opWithoutAuth, routerArgs} = await constructRouterContractOp({
        callerG,
        recipientG,
        amount: AMOUNT,
        estimatedGas,
        estimatedMaxUsdcForGas,
    });

    // >>>>> BACKEND

    const {unsignedCaller, sim} = await simulateAndGetUnsignedCaller({
        callerG, payerSigner, opWithoutAuth
    });

    // action: BACKEND sends unsignedCaller -> FRONTEND

    // >>>>> FRONTEND

    const opWithAuth = await makeOpWithAuth({userSigner, unsignedCaller, routerArgs, routerContractId: ROUTER_CONTRACT_ID});
    // action:   FRONTEND sends opWithAuth -> BACKEND

    // >>>>> BACKEND

    await submitOpWithAuthToRelayer({payerSigner, opWithAuth, sim});
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

