import { energyConsumers, energyDrawingSeats } from './energy-consumers';

describe('energy consumers', () => {
    it('reads the systems that draw energy from the hull design', () => {
        expect(energyConsumers('gravitas').sort()).toEqual(['chainGuns', 'radars', 'thrusters', 'tubes', 'warp']);
    });

    it('binds every seat with a command that spends energy, and no other', () => {
        expect(
            energyDrawingSeats({
                helms: ['rotation', 'afterBurner', 'dock'],
                weapons: ['fireChainGun', 'nextTarget'],
                engineer: ['systemPower', 'cycleRepairPriority'],
                signals: ['beamDirection', 'pauseJobs'],
                captain: [],
            }).sort(),
        ).toEqual(['engineer', 'helms', 'signals', 'weapons']);
    });
});
