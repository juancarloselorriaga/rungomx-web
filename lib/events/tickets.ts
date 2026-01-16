const CROCKFORD_BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' as const;

function parseUuidToBytes(uuid: string): Uint8Array | null {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    const start = i * 2;
    bytes[i] = Number.parseInt(hex.slice(start, start + 2), 16);
  }

  return bytes;
}

function encodeCrockfordBase32(bytes: Uint8Array): string {
  let output = '';
  let buffer = 0;
  let bufferBits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bufferBits += 8;

    while (bufferBits >= 5) {
      const index = (buffer >> (bufferBits - 5)) & 31;
      output += CROCKFORD_BASE32_ALPHABET[index];
      bufferBits -= 5;
    }
  }

  if (bufferBits > 0) {
    const index = (buffer << (5 - bufferBits)) & 31;
    output += CROCKFORD_BASE32_ALPHABET[index];
  }

  return output;
}

/**
 * Human-friendly ticket code derived from the registration UUID.
 *
 * Notes:
 * - Deterministic (no DB column required)
 * - Uses Crockford base32 alphabet to avoid ambiguous characters
 */
export function formatRegistrationTicketCode(registrationId: string): string {
  const bytes = parseUuidToBytes(registrationId);
  if (!bytes) {
    return registrationId.slice(0, 8).toUpperCase();
  }

  // 16 bytes (128 bits) encode to 26 base32 chars; we only display the first 8.
  const encoded = encodeCrockfordBase32(bytes).slice(0, 8);
  return `RG-${encoded.slice(0, 4)}-${encoded.slice(4)}`;
}

export const REGISTRATION_QR_PREFIX = 'rungomx://registration/' as const;

/**
 * QR payload for check-in scanners (encodes full UUID with a stable prefix).
 */
export function buildRegistrationQrPayload(registrationId: string): string {
  return `${REGISTRATION_QR_PREFIX}${registrationId}`;
}

