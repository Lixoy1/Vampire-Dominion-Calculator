/**
 * Runtime adapter for the single canonical data file.
 * Catalogs and calculation reference live together in ../data/vampire-dominion-data.json.
 */
import MASTER_DATA from '../data/vampire-dominion-data.json' with { type: 'json' };

export const GAME_DB = MASTER_DATA.catalog;
export const CALCULATION_REFERENCE = MASTER_DATA.calculation_reference;
export const LOCAL_ICON_BASE = './assets/icons/';

export function getIconUrl(iconPath) {
  if (!iconPath) return '';
  return LOCAL_ICON_BASE + String(iconPath).replace(/^\/+/, '');
}
