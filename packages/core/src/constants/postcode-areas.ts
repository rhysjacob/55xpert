/**
 * The UK postcode AREAS (the leading 1–2 letters, e.g. "BB", "SW", "M"). These
 * are the units a repairer selects for coverage at onboarding — an area like
 * "BB" covers every BB district (BB1, BB2, …) because the matching engine treats
 * coverageAreas as prefixes (see utils/postcode.ts). Selecting the area is the
 * "select all BB postcodes" behaviour from the onboarding brief.
 */
export const UK_POSTCODE_AREAS: readonly string[] = [
  'AB', 'AL', 'B', 'BA', 'BB', 'BD', 'BH', 'BL', 'BN', 'BR', 'BS', 'BT',
  'CA', 'CB', 'CF', 'CH', 'CM', 'CO', 'CR', 'CT', 'CV', 'CW',
  'DA', 'DD', 'DE', 'DG', 'DH', 'DL', 'DN', 'DT', 'DY',
  'E', 'EC', 'EH', 'EN', 'EX',
  'FK', 'FY',
  'G', 'GL', 'GU', 'GY',
  'HA', 'HD', 'HG', 'HP', 'HR', 'HS', 'HU', 'HX',
  'IG', 'IM', 'IP', 'IV',
  'JE',
  'KA', 'KT', 'KW', 'KY',
  'L', 'LA', 'LD', 'LE', 'LL', 'LN', 'LS', 'LU',
  'M', 'ME', 'MK', 'ML',
  'N', 'NE', 'NG', 'NN', 'NP', 'NR', 'NW',
  'OL', 'OX',
  'PA', 'PE', 'PH', 'PL', 'PO', 'PR',
  'RG', 'RH', 'RM',
  'S', 'SA', 'SE', 'SG', 'SK', 'SL', 'SM', 'SN', 'SO', 'SP', 'SR', 'SS', 'ST', 'SW', 'SY',
  'TA', 'TD', 'TF', 'TN', 'TQ', 'TR', 'TS', 'TW',
  'UB',
  'W', 'WA', 'WC', 'WD', 'WF', 'WN', 'WR', 'WS', 'WV',
  'YO',
  'ZE',
];
