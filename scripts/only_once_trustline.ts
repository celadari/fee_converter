// Create a trustline for user G... to classic asset (code, issuer) with sponsorship by backend
import {
    Asset,
    BASE_FEE,
    FeeBumpTransaction,
    Horizon,
    Keypair, Networks,
    Operation,
    TransactionBuilder,
    xdr
} from "@stellar/stellar-sdk";


export async function sponsorAndCreateTrustline(opts: {
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

async function main(): Promise<void> {
    const networkPassphrase = Networks.TESTNET;
    const backendKeypair = Keypair.fromSecret('SCUK4TJBBSKZVOS3ELZGRNGDYEGISJKMIN2KOY6E5XS6JXBQNUKYNGRO');
    const userKeyPair    = Keypair.fromSecret('SDJH3Q25A66PT27RSI2S2TPB6LJ72BZXOFUZU6TK72OW5A77EMLR57AA');
    const recipientKeypair       = Keypair.fromSecret('SCQYME5TXWWFQDBFJ2N3RPCHEUANSAUHCHJHOAELPCGHCD6TXV33NUNY');

    const callerG  = userKeyPair.publicKey();     // the user/actor (must require_auth)
    const recipientG   = recipientKeypair.publicKey();  // fee payer / sourceAccou

    const USDC_ISSUER             = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    const USDC_CODE               = 'USDC';

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
}