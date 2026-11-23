import { expect, it } from 'vitest';
import {
  formatAmountInput,
  formatDay,
  formatFeeText,
  formatMoney,
  formatRange,
} from './format.js';

const nbsp = ' ';

it('formats dates in German instead of ISO', () => {
  expect(formatDay('2027-05-22')).toBe('22. Mai 2027');
  expect(formatDay('2027-05-22T10:00:00.000Z')).toBe('22. Mai 2027');
  expect(formatRange('2027-05-22', '2027-05-23')).toBe('22.–23. Mai 2027');
  expect(formatRange('2027-05-30', '2027-06-01')).toBe(
    '30. Mai 2027 – 1. Juni 2027',
  );
  expect(formatRange('2027-05-22', '2027-05-22')).toBe('22. Mai 2027');
  expect(formatRange('2027-05-22', '')).toBe('22. Mai 2027');
});

it('shows a placeholder for a missing day and unparseable input as typed', () => {
  expect(formatDay(null)).toBe('–');
  expect(formatRange(null, null)).toBe('–');
  expect(formatDay('bald')).toBe('bald');
});

it('formats money with a decimal comma and the currency after the amount', () => {
  expect(formatMoney(12000, 'EUR')).toBe(`120,00${nbsp}€`);
  expect(formatMoney(123456, 'EUR')).toBe(`1.234,56${nbsp}€`);
  expect(formatMoney(5)).toBe(`0,05${nbsp}€`);
});

it('prefills amount fields with a decimal comma and no symbol or grouping', () => {
  expect(formatAmountInput(12000)).toBe('120,00');
  expect(formatAmountInput(123456)).toBe('1234,56');
});

it('formats a typed fee as money and keeps unfinished input visible', () => {
  expect(formatFeeText('120.00')).toBe(`120,00${nbsp}€`);
  expect(formatFeeText('25')).toBe(`25,00${nbsp}€`);
  expect(formatFeeText('7,5')).toBe(`7,50${nbsp}€`);
  expect(formatFeeText('')).toBe(`0,00${nbsp}€`);
  expect(formatFeeText('12x')).toBe('12x €');
});
