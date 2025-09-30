export function quoteFromBytes(data: Uint8Array): string {
  let result = "";

  for (let i = 0; i < data?.length; i++) {
    const byte = data[i];

    // Safe characters: alphanumeric and -_.~
    if (
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      byte === 0x2d ||
      byte === 0x5f || // - _
      byte === 0x2e ||
      byte === 0x7e
    ) {
      // . ~
      result += String.fromCharCode(byte);
    } else {
      // Percent-encode everything else
      result += "%" + byte.toString(16).padStart(2, "0").toUpperCase();
    }
  }

  return result;
}
