'use client';

import React from 'react';
import { PREDMET_PODRUCJA, PREDMET_PODRUCJA_GRUPE } from '@/lib/predmet-meta';

interface PodrucjeSelectOptionsProps {
  /** 'full' za forme/uređivanje, 'short' za kompaktne filtere */
  labelMode?: 'full' | 'short';
}

export function PodrucjeSelectOptions({ labelMode = 'full' }: PodrucjeSelectOptionsProps) {
  return (
    <>
      {PREDMET_PODRUCJA_GRUPE.map((grp) => {
        const items = PREDMET_PODRUCJA.filter((p) => p.group === grp.id);
        return (
          <optgroup key={grp.id} label={grp.label}>
            {items.map((p) => (
              <option key={p.value} value={p.value}>
                {labelMode === 'short' ? p.label : p.fullLabel}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
