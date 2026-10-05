/**
 * Tests — taxCalendarService.ts
 * Covers: getTaxZoneForDepartment, computeFrenchTaxCalendar, FRENCH_DEPARTMENTS
 * Note: fetchRemoteTaxCalendar (network) tested with mocked fetch separately.
 */

import { describe, it, expect } from 'vitest';
import {
  getTaxZoneForDepartment,
  computeFrenchTaxCalendar,
  FRENCH_DEPARTMENTS,
} from '../../../../src/services/fiscal/taxCalendarService';

// ══════════════════════════════════════════════════════════════════════════════
// FRENCH_DEPARTMENTS data integrity
// ══════════════════════════════════════════════════════════════════════════════
describe('FRENCH_DEPARTMENTS', () => {
  it('contains at least 100 departments', () => {
    expect(FRENCH_DEPARTMENTS.length).toBeGreaterThanOrEqual(100);
  });

  it('all entries have a code, name and zone', () => {
    for (const dept of FRENCH_DEPARTMENTS) {
      expect(dept.code).toBeTruthy();
      expect(dept.name).toBeTruthy();
      expect(['zone_1', 'zone_2', 'zone_3']).toContain(dept.zone);
    }
  });

  it('all three zones are represented', () => {
    const zones = new Set(FRENCH_DEPARTMENTS.map(d => d.zone));
    expect(zones.has('zone_1')).toBe(true);
    expect(zones.has('zone_2')).toBe(true);
    expect(zones.has('zone_3')).toBe(true);
  });

  it('Paris (75) is in zone_3', () => {
    const paris = FRENCH_DEPARTMENTS.find(d => d.code === '75');
    expect(paris?.zone).toBe('zone_3');
  });

  it('Ain (01) is in zone_1', () => {
    const ain = FRENCH_DEPARTMENTS.find(d => d.code === '01');
    expect(ain?.zone).toBe('zone_1');
  });

  it('Gironde (33) is in zone_2', () => {
    const gironde = FRENCH_DEPARTMENTS.find(d => d.code === '33');
    expect(gironde?.zone).toBe('zone_2');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getTaxZoneForDepartment
// ══════════════════════════════════════════════════════════════════════════════
describe('getTaxZoneForDepartment', () => {
  it('returns zone_1 for dept 01', () => {
    expect(getTaxZoneForDepartment('01')).toBe('zone_1');
  });

  it('returns zone_1 for dept 19 (boundary)', () => {
    expect(getTaxZoneForDepartment('19')).toBe('zone_1');
  });

  it('returns zone_2 for dept 21', () => {
    expect(getTaxZoneForDepartment('21')).toBe('zone_2');
  });

  it('returns zone_2 for dept 54 (boundary)', () => {
    expect(getTaxZoneForDepartment('54')).toBe('zone_2');
  });

  it('returns zone_3 for dept 55 (boundary)', () => {
    expect(getTaxZoneForDepartment('55')).toBe('zone_3');
  });

  it('returns zone_3 for Paris (75)', () => {
    expect(getTaxZoneForDepartment('75')).toBe('zone_3');
  });

  it('returns zone_3 for Réunion (974)', () => {
    expect(getTaxZoneForDepartment('974')).toBe('zone_3');
  });

  it('returns zone_1 for NR (non-residents)', () => {
    expect(getTaxZoneForDepartment('NR')).toBe('zone_1');
  });

  it('returns zone_1 for NON_RESIDENT', () => {
    expect(getTaxZoneForDepartment('NON_RESIDENT')).toBe('zone_1');
  });

  it('returns zone_3 when no department code given (default)', () => {
    expect(getTaxZoneForDepartment(undefined)).toBe('zone_3');
    expect(getTaxZoneForDepartment('')).toBe('zone_3');
  });

  it('is case-insensitive', () => {
    expect(getTaxZoneForDepartment('nr')).toBe('zone_1');
    expect(getTaxZoneForDepartment('2A')).toBe('zone_2');
    expect(getTaxZoneForDepartment('2a')).toBe('zone_2');
  });

  it('returns zone_3 for unknown department code (safe fallback)', () => {
    expect(getTaxZoneForDepartment('999')).toBe('zone_3');
    expect(getTaxZoneForDepartment('UNKNOWN')).toBe('zone_3');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// computeFrenchTaxCalendar
// ══════════════════════════════════════════════════════════════════════════════
describe('computeFrenchTaxCalendar', () => {
  it('returns a calendar with the correct fiscal year', () => {
    const cal = computeFrenchTaxCalendar(2024);
    expect(cal.year).toBe('2024');
  });

  it('declaration year is always fiscalYear + 1', () => {
    const cal = computeFrenchTaxCalendar(2024);
    expect(cal.declarationYear).toBe('2025');
  });

  it('accepts string year as input', () => {
    const cal = computeFrenchTaxCalendar('2024');
    expect(cal.year).toBe('2024');
  });

  it('returns calendar with all required date fields', () => {
    const cal = computeFrenchTaxCalendar(2024);
    expect(cal.declarationOpening).toBeTruthy();
    expect(cal.zoneDeadlines?.zone1).toBeTruthy();
    expect(cal.zoneDeadlines?.zone2).toBeTruthy();
    expect(cal.zoneDeadlines?.zone3).toBeTruthy();
  });

  it('zone deadlines are in order: zone1 ≤ zone2 ≤ zone3', () => {
    const cal = computeFrenchTaxCalendar(2024);
    const d1 = new Date(cal.zoneDeadlines?.zone1 ?? '');
    const d2 = new Date(cal.zoneDeadlines?.zone2 ?? '');
    const d3 = new Date(cal.zoneDeadlines?.zone3 ?? '');
    expect(d1.getTime()).toBeLessThanOrEqual(d2.getTime());
    expect(d2.getTime()).toBeLessThanOrEqual(d3.getTime());
  });

  it('declaration opening is before zone1 deadline', () => {
    const cal = computeFrenchTaxCalendar(2024);
    const opening = new Date(cal.declarationOpening);
    const zone1 = new Date(cal.zoneDeadlines?.zone1 ?? '');
    expect(opening.getTime()).toBeLessThan(zone1.getTime());
  });

  it('all date fields are valid ISO 8601 strings', () => {
    const cal = computeFrenchTaxCalendar(2024);
    const dateFields = [
      cal.declarationOpening,
      cal.zoneDeadlines?.zone1,
      cal.zoneDeadlines?.zone2,
      cal.zoneDeadlines?.zone3,
    ];
    for (const d of dateFields) {
      if (d) {
        expect(new Date(d).toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}/);
      }
    }
  });

  it('works for a future year (algorithmic, not hardcoded)', () => {
    const cal = computeFrenchTaxCalendar(2030);
    expect(cal.year).toBe('2030');
    expect(cal.declarationYear).toBe('2031');
    expect(cal.zoneDeadlines?.zone1).toBeTruthy();
  });

  it('works for past years', () => {
    const cal = computeFrenchTaxCalendar(2022);
    expect(cal.year).toBe('2022');
  });

  it('deadlines are in May or June of declaration year', () => {
    const cal = computeFrenchTaxCalendar(2024);
    const zone1 = new Date(cal.zoneDeadlines?.zone1 ?? '');
    // DGFiP deadlines are typically in May-June
    const month = zone1.getUTCMonth(); // 0-indexed: 4=May, 5=June
    expect(month).toBeGreaterThanOrEqual(4);
    expect(month).toBeLessThanOrEqual(5);
  });
});
