const regionByLanguage: Record<string, string> = {
  af: 'ZA', am: 'ET', ar: 'SA', az: 'AZ', be: 'BY', bg: 'BG', bn: 'BD', bs: 'BA',
  ca: 'ES', cs: 'CZ', cy: 'GB', da: 'DK', de: 'DE', el: 'GR', en: 'GB', es: 'ES',
  et: 'EE', eu: 'ES', fa: 'IR', fi: 'FI', fr: 'FR', ga: 'IE', gl: 'ES', he: 'IL',
  hi: 'IN', hr: 'HR', hu: 'HU', hy: 'AM', id: 'ID', is: 'IS', it: 'IT', ja: 'JP',
  ka: 'GE', kk: 'KZ', km: 'KH', ko: 'KR', lo: 'LA', lt: 'LT', lv: 'LV', mk: 'MK',
  ml: 'IN', mn: 'MN', ms: 'MY', mt: 'MT', my: 'MM', nb: 'NO', ne: 'NP', nl: 'NL',
  nn: 'NO', no: 'NO', pa: 'IN', pl: 'PL', ps: 'AF', pt: 'PT', ro: 'RO', ru: 'RU',
  si: 'LK', sk: 'SK', sl: 'SI', sq: 'AL', sr: 'RS', sv: 'SE', sw: 'KE', ta: 'IN',
  te: 'IN', th: 'TH', tl: 'PH', tr: 'TR', uk: 'UA', ur: 'PK', uz: 'UZ', vi: 'VN',
  zh: 'CN', zu: 'ZA',
};

function regionalIndicator(region: string) {
  return String.fromCodePoint(...Array.from(region.toUpperCase(), (letter) => 0x1f1a5 + letter.charCodeAt(0)));
}

export function languageFlag(languageTag: string) {
  const subtags = languageTag.split('-');
  const region = subtags.slice(1).find((subtag) => /^[A-Za-z]{2}$/.test(subtag))
    ?? regionByLanguage[subtags[0]?.toLowerCase() ?? ''];
  if (!region) return '';
  return regionalIndicator(region);
}
