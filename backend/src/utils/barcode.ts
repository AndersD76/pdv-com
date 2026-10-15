// Códigos de barras das peças são impressos como EAN-13: 12 dígitos de dados + 1 dígito verificador

export function ean13CheckDigit(data12: string): number {
  const sum = data12.split('').reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

// Leitura de etiqueta EAN-13 (13 dígitos com verificador válido) -> os 12 dígitos guardados no cadastro
export function ean13ToStoredCode(scanned: string): string | null {
  if (!/^\d{13}$/.test(scanned)) return null;
  const data = scanned.slice(0, 12);
  return ean13CheckDigit(data) === Number(scanned[12]) ? data : null;
}
