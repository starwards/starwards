import { ShipModel } from '@starwards/core';

export type ShipBlipAsset = 'fighter' | 'station';

const modelToBlipAsset: Partial<Record<ShipModel, ShipBlipAsset>> = {
    'large-station': 'station',
    'small-station': 'station',
};

export function resolveShipBlipAsset(model: ShipModel | null): ShipBlipAsset {
    return (model && modelToBlipAsset[model]) || 'fighter';
}
