import { ShipTestHarness } from './ship-test-harness';
import { PowerLevel } from '../src/ship/system';

describe('Energy Budget Analysis', () => {
    it('should have net-positive energy at max reactor with full cooling', () => {
        const harness = new ShipTestHarness('Dragonfly MK I "Recon"');
        const ship = harness.ship;

        // Set all systems to max power
        ship.state.reactor.power = PowerLevel.MAX;
        ship.state.maneuvering.power = PowerLevel.MAX;
        ship.state.smartPilot.power = PowerLevel.MAX;
        ship.state.signals.power = PowerLevel.MAX;

        for (const radar of ship.state.radars) {
            radar.power = PowerLevel.MAX;
        }
        for (const chainGun of ship.state.chainGuns) {
            chainGun.power = PowerLevel.MAX;
        }
        for (const thruster of ship.state.thrusters) {
            thruster.power = PowerLevel.MAX;
        }

        // Set all systems to max cooling (no heat buildup)
        ship.state.reactor.coolantFactor = 1;
        ship.state.maneuvering.coolantFactor = 1;
        ship.state.smartPilot.coolantFactor = 1;
        ship.state.signals.coolantFactor = 1;

        for (const radar of ship.state.radars) {
            radar.coolantFactor = 1;
        }
        for (const chainGun of ship.state.chainGuns) {
            chainGun.coolantFactor = 1;
        }
        for (const thruster of ship.state.thrusters) {
            thruster.coolantFactor = 1;
        }

        // Simulate normal operations: maneuvering, radar scanning, no firing
        ship.state.rotation = 0.5; // half rotation
        ship.state.boost = 0.5; // half forward thrust
        ship.state.strafe = 0.0;

        const initialEnergy = ship.state.reactor.energy;
        const testDuration = 10; // seconds
        const deltaSeconds = 1 / 60; // 60 Hz tick rate

        const energySnapshots: number[] = [initialEnergy];

        // Run simulation
        for (let t = 0; t < testDuration; t += deltaSeconds) {
            harness.tick(deltaSeconds);
            energySnapshots.push(ship.state.reactor.energy);
        }

        const finalEnergy = ship.state.reactor.energy;
        const energyDelta = finalEnergy - initialEnergy;
        const energyPerSecond = energyDelta / testDuration;

        console.log(`\n=== Energy Budget Analysis ===`);
        console.log(`Initial Energy: ${initialEnergy.toFixed(2)}`);
        console.log(`Final Energy: ${finalEnergy.toFixed(2)}`);
        console.log(`Energy Delta: ${energyDelta.toFixed(2)}`);
        console.log(`Energy per Second: ${energyPerSecond.toFixed(2)}`);
        console.log(`Reactor Output: ${ship.state.reactor.energyPerSecond.toFixed(2)} E/s`);
        console.log(`\nSystem Status:`);
        console.log(`- Reactor: power=${ship.state.reactor.power}, eff=${ship.state.reactor.effectiveness.toFixed(2)}`);
        console.log(
            `- Maneuvering: power=${ship.state.maneuvering.power}, eff=${ship.state.maneuvering.effectiveness.toFixed(2)}, starved=${ship.state.maneuvering.energyStarved}`,
        );
        console.log(
            `- Radars: ${ship.state.radars.map((r, i) => `[${i}]=${r.powered ? 'on' : 'off'}`).join(', ')}`,
        );
        console.log(
            `- Thrusters: ${ship.state.thrusters.map((t, i) => `[${i}]=${t.energyStarved ? 'STARVED' : 'ok'}`).join(', ')}`,
        );

        // A ship at max reactor and max cooling should be net-positive or at least stable
        // If energy is draining, the budget is broken
        expect(energyPerSecond).toBeGreaterThan(-0.1); // Allow tiny rounding error
    });

    it('should measure energy consumption by system', () => {
        const harness = new ShipTestHarness('Dragonfly MK I "Recon"');
        const ship = harness.ship;

        // Max power, max cooling
        ship.state.reactor.power = PowerLevel.MAX;
        ship.state.maneuvering.power = PowerLevel.MAX;

        for (const radar of ship.state.radars) {
            radar.power = PowerLevel.MAX;
        }
        for (const thruster of ship.state.thrusters) {
            thruster.power = PowerLevel.MAX;
        }

        // Baseline: idle ship
        const baselineEnergy = ship.state.reactor.energy;
        for (let i = 0; i < 60; i++) {
            harness.tick(1 / 60);
        }
        const idleEnergyPerSecond = (ship.state.reactor.energy - baselineEnergy) / 1.0;

        // Reset
        ship.state.reactor.energy = baselineEnergy;

        // Test: rotation only
        ship.state.rotation = 1.0;
        for (let i = 0; i < 60; i++) {
            harness.tick(1 / 60);
        }
        const rotationEnergyPerSecond = (ship.state.reactor.energy - baselineEnergy) / 1.0;

        // Reset
        ship.state.reactor.energy = baselineEnergy;
        ship.state.rotation = 0;

        // Test: forward thrust only
        ship.state.boost = 1.0;
        for (let i = 0; i < 60; i++) {
            harness.tick(1 / 60);
        }
        const thrustEnergyPerSecond = (ship.state.reactor.energy - baselineEnergy) / 1.0;

        // Reset
        ship.state.reactor.energy = baselineEnergy;
        ship.state.boost = 0;

        // Test: afterburner charging
        ship.state.maneuvering.afterBurnerFuel = 0;
        for (let i = 0; i < 60; i++) {
            harness.tick(1 / 60);
        }
        const afterburnerChargeEnergyPerSecond = (ship.state.reactor.energy - baselineEnergy) / 1.0;

        console.log(`\n=== Energy Consumption by System ===`);
        console.log(`Reactor Output: ${ship.state.reactor.energyPerSecond.toFixed(2)} E/s`);
        console.log(`Idle (radars only): ${idleEnergyPerSecond.toFixed(2)} E/s`);
        console.log(`Rotation (full): ${rotationEnergyPerSecond.toFixed(2)} E/s`);
        console.log(`Thrust (full forward): ${thrustEnergyPerSecond.toFixed(2)} E/s`);
        console.log(`Afterburner Charge (from empty): ${afterburnerChargeEnergyPerSecond.toFixed(2)} E/s`);

        console.log(`\nPer-System Consumption:`);
        console.log(`- Rotation: ${(idleEnergyPerSecond - rotationEnergyPerSecond).toFixed(2)} E/s`);
        console.log(`- Thrust: ${(idleEnergyPerSecond - thrustEnergyPerSecond).toFixed(2)} E/s`);
        console.log(`- Afterburner Charge: ${(idleEnergyPerSecond - afterburnerChargeEnergyPerSecond).toFixed(2)} E/s`);
    });
});
