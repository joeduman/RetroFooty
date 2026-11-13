import {SHOP_ITEMS} from './shop-config.mjs';
import {RANK_SHIRTS} from './rank-rewards.mjs';
export const COSMETIC_ITEMS=Object.freeze([RANK_SHIRTS[0],...SHOP_ITEMS,...RANK_SHIRTS.slice(1)]);
export const SHIRTS=Object.freeze(COSMETIC_ITEMS.filter(item=>item.kind==='shirt'));
export const normalizeShirt=id=>SHIRTS.some(item=>item.value===id)?id:'rookie';
