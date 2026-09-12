export function formatPrice(price?: number | null): string {
  if (price === undefined || price === null || isNaN(price)) return '0.00';
  if (price === 0) return '0.00';
  const absPrice = Math.abs(price);
  if (absPrice >= 1000) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (absPrice >= 1) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } else if (absPrice >= 0.01) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  } else {
    // For micro-caps
    const str = price.toFixed(12);
    // Remove trailing zeros
    return str.replace(/\.?0+$/, '');
  }
}

export function formatNumber(val?: number | null, decimals: number = 2): string {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatISTDateTime(dateInput?: string | number | Date | null): string {
  if (!dateInput) return '-';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);
  } catch (e) {
    return '-';
  }
}

