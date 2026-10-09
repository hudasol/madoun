/**
 * AUTHENTICATION PLACEHOLDER. NOTHING IS ENFORCED HERE.
 *
 * `authorize()` currently allows every request. It exists so that every route handler already
 * passes through one named seam, and a real mechanism can be added in one place.
 *
 * Intended design for a real deployment (not implemented, not tested, not a security claim):
 *  - Transport: mutual TLS between the customs adapter and Madoun, terminated at the government
 *    network gateway. The client certificate subject identifies the calling system (e.g. an
 *    ATLP/MAMAR adapter) and is mapped to a client id.
 *  - Application layer: a per-client API key in `Authorization: Bearer <key>`, stored hashed,
 *    rotated, scoped per route (read:shipments, read:receipts, write:assessments) and rate limited.
 *  - Authorisation: receipts carry a `sharedWith` policy; the real API must filter every receipt
 *    response by the caller's authority id. This mock returns all receipts to everyone.
 *  - Audit: every call logged with client id, route and request id (no payload bodies).
 *
 * All data served by this mock is synthetic, which is the only reason leaving it open is acceptable.
 */
export interface AuthDecision {
  allowed: boolean;
  /** Identity of the caller once real auth exists. Always 'anonymous-mock' today. */
  clientId: string;
}

export function authorize(_request: Request): AuthDecision {
  void _request;
  return { allowed: true, clientId: 'anonymous-mock' };
}
