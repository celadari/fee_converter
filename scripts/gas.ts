import {
    Address,
    authorizeEntry,
    BASE_FEE,
    Keypair,
    nativeToScVal,
    Networks,
    Operation,
    rpc,
    TransactionBuilder,
    xdr,
} from '@stellar/stellar-sdk';

type SimulateTransactionResponse = rpc.Api.SimulateTransactionResponse;

// ---------- Config ----------
const rpcUrl = 'https://soroban-testnet.stellar.org';
const networkPassphrase = Networks.TESTNET;
const server = new rpc.Server(rpcUrl);

// ---------- Secrets ----------
const backendKeypair = Keypair.fromSecret('SCUK4TJBBSKZVOS3ELZGRNGDYEGISJKMIN2KOY6E5XS6JXBQNUKYNGRO');
const userKeyPair    = Keypair.fromSecret('SDJH3Q25A66PT27RSI2S2TPB6LJ72BZXOFUZU6TK72OW5A77EMLR57AA');
const recipientKeypair       = Keypair.fromSecret('SCQYME5TXWWFQDBFJ2N3RPCHEUANSAUHCHJHOAELPCGHCD6TXV33NUNY');

// ---------- Contracts / addrs ----------
const ROUTER_CONTRACT_ID      = 'CCNXMLQRLAAZ5MGK5HXMWFDZEU6SE67Y5CHI3QTKXIGY46PUU5NJJZS5';       // C...
const USDC_TOKEN_CONTRACT_ID  = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';   // C...
const XLM_TOKEN_CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

const SOROSWAP_ROUTER_ID      = 'CCMAPXWVZD4USEKDWRYS7DA4Y3D7E2SDMGBFJUCEXTC7VN6CUBGWPFUS';




// Soroban token amounts are often i128; if your token uses u64, keep u64 like below

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



async function estimateGasXlm(): Promise<number> {
    return 2 * Number(BASE_FEE);
}

async function estimateMaxUsdcForGas({margin, estimatedGasXlm, rateXlmToUsdc}: {margin: number, estimatedGasXlm: number, rateXlmToUsdc: number}): Promise<number> {
    const SCALE = 10 ** 7;
    return Math.ceil((estimatedGasXlm * rateXlmToUsdc + margin) * SCALE);
}

// BACKEND
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

async function simulateAndGetUnsignedCaller({callerG, payerG, opWithoutAuth
                                                }: {callerG: string, payerG: string, opWithoutAuth: xdr.Operation}
    ) {
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


async function makeOpWithAuth({unsignedCaller, routerArgs, routerContractId}: {routerContractId: string, unsignedCaller: xdr.SorobanAuthorizationEntry, routerArgs: xdr.ScVal[]}) {
    const latest = await server.getLatestLedger();
    const validUntil = latest.sequence + 1000; // ledger seq horizon for auth validity

    const signedAuth: xdr.SorobanAuthorizationEntry[] = [];
    signedAuth.push(await authorizeEntry(unsignedCaller, userKeyPair, validUntil, networkPassphrase));

    // ---------- 4) Build the SAME op WITH signed auth ----------
    return Operation.invokeContractFunction({
        contract: routerContractId,
        function: 'exec',
        args: routerArgs,
        auth: signedAuth,
    });
}

async function submitOpWithAuthToRelayer({payerG, opWithAuth, sim
                                         }: {payerG: string, opWithAuth: xdr.Operation, sim: SimulateTransactionResponse}
) {
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


async function main() {
    const AMOUNT = BigInt(10_000); // u64 example (e.g., 0.10 USDC with 6 dp)
    const RATE_XLM_TO_USDC = 0.4;
    const XLM_EXTRA_MARGIN = 0.001;
    const callerG  = userKeyPair.publicKey();     // the user/actor (must require_auth)
    const payerG   = backendKeypair.publicKey();  // fee payer / sourceAccount
    const recipientG= recipientKeypair.publicKey();
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
        callerG, payerG, opWithoutAuth
    });

    // action: BACKEND sends unsignedCaller -> FRONTEND

    // >>>>> FRONTEND

    const opWithAuth = await makeOpWithAuth({unsignedCaller, routerArgs, routerContractId: ROUTER_CONTRACT_ID});
    // action:   FRONTEND sends opWithAuth -> BACKEND

    // >>>>> BACKEND

    await submitOpWithAuthToRelayer({payerG, opWithAuth, sim});
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

