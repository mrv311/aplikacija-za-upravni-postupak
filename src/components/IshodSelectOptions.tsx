'use client';

import React from 'react';
import { PREDMET_ISHODI, PREDMET_ISHODI_GRUPE } from '@/lib/predmet-meta';

interface IshodSelectOptionsProps {
  /** 'full' za forme/arhiviranje (s člancima ZUP-a), 'short' za kompaktne filtere */
  labelMode?: 'full' | 'short';
  /** Ako postojeći zapis koristi stariji/prilagođeni ishod izvan aktualnog popisa, zadrži ga vidljivim */
  currentValue?: string | null;
}

export function IshodSelectOptions({
  labelMode = 'full',
  currentValue,
}: IshodSelectOptionsProps) {
  const hasUnknownCurrent =
    Boolean(currentValue) &&
    currentValue !== 'sve' &&
    !currentValue?.startsWith('__bucket_') &&
    !PREDMET_ISHODI.some((i) => i.value === currentValue);

  return (
    <>
      {hasUnknownCurrent && currentValue && (
        <option value={currentValue}>{currentValue}</option>
      )}
      {PREDMET_ISHODI_GRUPE.map((grp) => {
        const items = PREDMET_ISHODI.filter((i) => i.group === grp.id);
        return (
          <optgroup key={grp.id} label={grp.label}>
            {items.map((ish) => (
              <option key={ish.value} value={ish.value}>
                {labelMode === 'short' ? ish.shortLabel : ish.label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
