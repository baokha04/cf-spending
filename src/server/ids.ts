const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ I, O, 0, 1 cho dễ đọc qua điện thoại

export function newId(): string {
  return crypto.randomUUID();
}

/** Mã mời 8 ký tự, dạng ABCD-EFGH. */
export function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
    if (i === 3) out += '-';
  }
  return out;
}

export function normalizeInviteCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length === 8 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}` : cleaned;
}
