/**
 * Synchronous SHA-256 for the engine, backed by the audited @noble/hashes implementation
 * (runs unchanged in browsers and Node, no async crypto needed). It replaces the hand-written
 * version this file used to carry: identical output, one less thing to audit.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export function sha256Hex(message: string): string {
  return bytesToHex(sha256(utf8ToBytes(message)));
}
