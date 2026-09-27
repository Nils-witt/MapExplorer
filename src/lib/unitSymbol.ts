import { erzeugeTaktischesZeichen } from '@taktische-zeichen/core';
import type { UnitSymbol, UnitTacticalName } from '../api/UnitServer';

// Renders a unit's tactical symbol as an SVG data URL, labelled from its
// tactical name the way go-unit-mangement's own map does. Null for a unit
// without a symbol, or one the library can't render (e.g. an ID it no
// longer knows).
export function symbolDataUrl(
  symbol: UnitSymbol | null,
  tacticalName: UnitTacticalName | null,
): string | null {
  if (!symbol || (!symbol.grundzeichen && !symbol.symbol)) {
    return null;
  }
  const name = [
    tacticalName?.regionalAssociation,
    tacticalName?.localAssociation,
    tacticalName?.number,
  ]
    .filter(Boolean)
    .join('-');
  try {
    return erzeugeTaktischesZeichen({
      ...symbol,
      organisationName: tacticalName?.organisation,
      typ: tacticalName?.function,
      name: name || undefined,
    }).dataUrl;
  } catch {
    return null;
  }
}

// The call sign in one line, e.g. "Rotkreuz Musterstadt 12/83-1"; null
// without any parts.
export function formatTacticalName(
  tacticalName: UnitTacticalName | null,
): string | null {
  if (!tacticalName) {
    return null;
  }
  const { organisation, regionalAssociation, localAssociation } = tacticalName;
  const suffix = [
    tacticalName.function,
    (tacticalName.number ?? '').padStart(2, '0'),
  ]
    .filter(Boolean)
    .join('-');
  const text = [
    organisation,
    regionalAssociation,
    [localAssociation?.padStart(2, '0'), suffix].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
  return text || null;
}
