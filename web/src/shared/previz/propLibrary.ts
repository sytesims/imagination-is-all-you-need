/**
 * Add props (2026-10-26): what the drawer offers, by tab. Furniture, kitchen, nature, holiday and the bottle come from the scene kits
 * (world/propCatalog.ts, generated); the street and the city's trees and cars are the open city's own kit (world/kitCatalog.ts), named here.
 * One list for every preset and the open city (props are drawn by the shared engine, previz/engine.ts).
 */
import { PROP_PIECES } from '../../../../server/src/shared/world/propCatalog';
import { KIT } from '../../../../server/src/shared/world/kitCatalog';

export interface PropTab { id: string; label: string; items: { id: string; label: string }[] }
const STREET: [string, string][] = [['kk.bench', 'Bench'], ['kk.streetlight', 'Street light'], ['kk.trafficlight_A', 'Traffic light'], ['kk.firehydrant', 'Fire hydrant'], ['kk.trash_A', 'Bin'],
  ['kk.dumpster', 'Skip'], ['kk.box_A', 'Boxes'], ['kc.detail-parasol-a', 'Parasol'], ['ks.planter', 'Planter'], ['ks.fence-1x4', 'Fence'], ['kk.bush', 'Hedge'],
  ['kk.car_sedan', 'Car'], ['kk.car_hatchback', 'Small car'], ['kk.car_taxi', 'Taxi'], ['kk.car_stationwagon', 'Estate car'], ['kv.van', 'Van'], ['kv.suv', 'SUV'], ['kv.truck', 'Truck'], ['kv.delivery', 'Delivery van'],
  ['kk.building_E', 'Shop building'], ['kk.building_A', 'Corner shop'], ['ks.building-type-a', 'House'], ['ks.building-type-c', 'Family house']];
const CITY_NATURE: [string, string][] = [['kn.tree_oak', 'Oak'], ['kn.tree_palmTall', 'Palm'], ['kn.tree_pineTallA', 'Pine'], ['kn.tree_default', 'Tree'], ['kn.rock_largeA', 'Large rock'], ['kn.plant_bushLarge', 'Shrub'],
  ['kn.flower_redA', 'Flowers'], ['kn.log_stack', 'Log pile'], ['kn.statue_column', 'Column'], ['kn.tent_detailedOpen', 'Tent'], ['kn.canoe', 'Canoe']];
const fromKit = (rows: [string, string][]) => rows.filter(([id]) => KIT[id]).map(([id, label]) => ({ id, label }));
const group = (g: string) => Object.entries(PROP_PIECES).filter(([, p]) => p.group === g).map(([id, p]) => ({ id, label: p.label }));
export const PROP_TABS: PropTab[] = [
  { id: 'home', label: 'Home', items: group('home') },
  { id: 'kitchen', label: 'Kitchen', items: group('kitchen') },
  { id: 'street', label: 'Street', items: fromKit(STREET) },
  { id: 'nature', label: 'Nature', items: [...group('nature'), ...fromKit(CITY_NATURE)] },
  { id: 'holiday', label: 'Holiday', items: group('holiday') },
  { id: 'product', label: 'Product', items: group('product') },
];
const LABELS = new Map(PROP_TABS.flatMap((t) => t.items.map((i) => [i.id, i.label] as const)));
export const propLabel = (id: string) => LABELS.get(id) ?? id.split('.').pop()!.replace(/[-_]/g, ' ');
/** where the drawer opens for a preset (its most useful tab) */
export const defaultTab = (template: string) => template === 'walkthrough' ? 'home' : template === 'diorama' ? 'holiday' : template === 'product-hero' ? 'product' : template === 'establishing' ? 'nature' : 'street';
/** the size a new prop starts at in a preset (the diorama is a miniature: about 1:7) */
export const propStartScale = (template: string) => (template === 'diorama' ? 0.14 : 1);
/** half the footprint's diagonal at size 1 (metres), for spacing new drops */
export const pieceRadius = (id: string) => { const k = PROP_PIECES[id] ?? KIT[id]; return k ? Math.hypot(k.w, k.d) / 2 : 0.5; };
