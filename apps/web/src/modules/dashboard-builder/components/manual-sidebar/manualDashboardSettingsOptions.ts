export interface ManualDashboardOption {
  label: string;
  value: string;
}

export const defaultDashboardCurrencySymbol = '$';

export const dashboardCurrencyOptions: ManualDashboardOption[] = [
  { value: '$', label: 'USD ($)' },
  { value: '€', label: 'EUR (€)' },
  { value: '£', label: 'GBP (£)' },
  { value: '¥', label: 'JPY (¥)' },
  { value: '₹', label: 'INR (₹)' },
  { value: '₩', label: 'KRW (₩)' },
  { value: 'A$', label: 'AUD (A$)' },
  { value: 'C$', label: 'CAD (C$)' },
  { value: 'CHF', label: 'CHF (CHF)' },
  { value: 'HK$', label: 'HKD (HK$)' },
  { value: 'S$', label: 'SGD (S$)' },
  { value: 'NZ$', label: 'NZD (NZ$)' },
  { value: 'kr', label: 'SEK/NOK/DKK (kr)' },
  { value: 'R$', label: 'BRL (R$)' },
  { value: 'R', label: 'ZAR (R)' },
  { value: '₨', label: 'NPR (₨)' }
];
