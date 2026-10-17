# Key custody

Madoun signs two kinds of things with Ed25519: receipt attestations (each verifying authority signs the receipts it vouches for, `src/engine/sign.ts`) and ledger checkpoints (the ledger operator signs the Merkle root, `src/engine/checkpoint.ts`). The engine never holds a private key. It only sees the `Signer` interface:

```ts
interface Signer { authorityId: string; sign(message: Uint8Array): Uint8Array }
```

## What exists today
| Option | Where | Status |
|---|---|---|
| Demo keys | `demoSigner` in `src/engine/sign.ts` | Default. Secrets are derived from public strings, so **anyone can forge these signatures**. They demonstrate the mechanism, not identity. Every API response and page that shows a signature says so. |
| File based development keystore | `src/server/keystore.ts`, created with `node scripts/dev-keystore.mjs` | Optional, for the ledger checkpoint. Set `MADOUN_LEDGER_KEY_FILE=.keys/ledger.key`. **Development only**: a key in a file can be copied by anyone who can read it, and nothing rotates, revokes or audits it. The `.keys/` folder is ignored by git. |

## What production needs (not implemented)
1. **Keys generated and kept inside a hardware security module or a cloud key management service** run by, or for, each signing party: each authority for its own receipt attestations, the ledger operator for checkpoints. Private keys are marked non exportable.
2. **A `Signer` that calls the HSM or KMS.** Those services sign asynchronously over the network, so the interface would gain an asynchronous variant (`sign(message): Promise<Uint8Array>`); the engine signs only at the edges (attestation and checkpoint creation), so that change does not reach the pure reducer.
3. **A published key registry**: each party's current public key and validity period, distributed through a channel verifiers already trust (for example a signed configuration file in the trial environment), never taken from the response being verified.
4. **Rotation and revocation**: a new key for each period, old keys kept for verification of old signatures, and a revocation list checked by verifiers.
5. **Separation of duties**: the people who operate the ledger cannot use an authority's attestation key, and the reverse.
6. **Audit**: every signing operation logged by the HSM or KMS with the caller's identity.

## How a verifier should obtain the public key
`scripts/verify-proof.mjs` takes the public key as an argument on purpose. The `/api/v1/ledger/checkpoint` response includes a public key for convenience in the demo, but a verifier who takes the key from the same server that produced the proof proves only that the server is consistent with itself.
