export type Money = Readonly<{ minorUnits: bigint; currency: 'BRL' }>;

export const money = (minorUnits: bigint): Money => {
  if (minorUnits < 0n) throw new Error('Money cannot be negative');
  return { minorUnits, currency: 'BRL' };
};

export const moneyDelta = (minorUnits: bigint): Money => ({
  minorUnits,
  currency: 'BRL',
});

export const moneyFromDecimal = (value: string): Money => {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Invalid BRL decimal');
  const [whole = '0', fraction = ''] = value.split('.');
  return money(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
};

export const moneyToDecimal = (value: Money): string => {
  const sign = value.minorUnits < 0n ? '-' : '';
  const absolute = value.minorUnits < 0n ? -value.minorUnits : value.minorUnits;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
};
