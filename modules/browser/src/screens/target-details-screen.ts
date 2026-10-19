import {
    Driver,
    Faction,
    ScanLevel,
    ShipDriver,
    SnapshotFetch,
    SpaceDriver,
    SpaceObject,
    Spaceship,
    decodeShipSnapshot,
    playerScanLevel,
    snapshotShipDriver,
} from '@starwards/core';
import { ScreenContainer, ScreenTeardown, setDisplayOnly } from './station-lifecycle';
import { addTextBlade, createWidgetPane } from '../panel';

import $ from 'jquery';
import { EmitterLoop } from '../loop';
import { WidgetContainer } from '../container';
import { drawArmorStatus } from '../widgets/armor';
import { drawFullSystemsStatus } from '../widgets/full-system-status';
import { drawRadarHeader } from '../widgets/radar-header';
import { drawTargetTubes } from '../widgets/target-tubes';
import { hsl } from '../colors';
import { propertyStub } from '../property-wrappers';
import { stationGrid } from '../container';

/**
 * Target Details (SPEC-0008): read-only view of the contact marked on this ship's Signals station
 * (`ShipState.signalsTargetId`). At FULL scan it draws the target ship's internals live from the
 * target's own room; at SNAPSHOT it draws the faction's frozen snapshot, fetched from this ship's
 * room; at every lower level it shows "no data". No hotkeys, no commands.
 */
export async function initTargetDetailsScreen(
    driver: Driver,
    container: ScreenContainer,
    shipId: string,
): Promise<ScreenTeardown> {
    setDisplayOnly(true, 'target-details');
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();

    const grid = stationGrid(container, { left: 250, right: 256 });
    const header = drawSubjectHeader(grid.left(), spaceDriver);
    drawRadarHeader(grid.center({ fill: true }), 'TARGET DETAILS', `SHIP ${shipId}`);
    const noData = drawNoData(grid.center({ fill: true }));

    const snapshots = new SnapshotFetch((msg) => shipDriver.needSnapshot(msg));
    const stopSnapshots = shipDriver.onSnapshot((msg) => snapshots.receive(msg));

    // internals slots are created per source (live room or snapshot) and removed on teardown,
    // which disposes their panes
    let panelsKey: string | undefined;
    let teardownPanels: (() => void) | undefined;
    const stopPanels = () => {
        teardownPanels?.();
        teardownPanels = undefined;
        panelsKey = undefined;
    };

    function startPanels(key: string, source: Promise<ShipDriver>) {
        panelsKey = key;
        void source.then((subjectDriver) => {
            if (panelsKey !== key) return; // source changed (or screen torn down) while awaiting
            const armorSlot = grid.center({ fill: true });
            const tubesSlot = grid.left({ scroll: true });
            const systemsSlot = grid.right({ scroll: true });
            const armorApp = drawArmorStatus(armorSlot, subjectDriver, 300);
            drawTargetTubes(tubesSlot, subjectDriver);
            drawFullSystemsStatus(systemsSlot, subjectDriver, subjectDriver.systems, true);
            teardownPanels = () => {
                void armorApp.then((app) => app.destroy({ removeView: true }, true));
                for (const slot of [armorSlot, tubesSlot, systemsSlot]) slot.getElement().remove();
            };
        });
    }

    const loop = new EmitterLoop(200);
    loop.onLoop(() => {
        const faction = shipDriver.state.faction;
        const subject = spaceDriver.state.get(shipDriver.state.signalsTargetId);
        const scanLevel = subject ? playerScanLevel(subject, faction) : undefined;
        const ship = subject && Spaceship.isInstance(subject) ? subject : undefined;
        const live = ship && scanLevel !== undefined && scanLevel >= ScanLevel.FULL;
        const frozen = ship && scanLevel === ScanLevel.SNAPSHOT ? ship : undefined;
        snapshots.update(frozen?.id, frozen?.scanSnapshotCapturedAt[Number(faction)] ?? 0);
        const snapshot = frozen && snapshots.snapshot;

        const key = live ? `live/${ship.id}` : snapshot ? `snapshot/${snapshot.targetId}/${snapshot.capturedAt}` : '';
        if (key !== (panelsKey ?? '')) {
            stopPanels();
            if (live) {
                startPanels(key, driver.getShipDriver(ship.id));
            } else if (snapshot) {
                startPanels(key, Promise.resolve(snapshotShipDriver(decodeShipSnapshot(snapshot.data))));
            }
        }
        const intel = live ? 'LIVE' : snapshot ? `LAST KNOWN · ${formatAge(snapshot.ageSeconds)}` : 'NO DATA';
        header.show(subject, scanLevel, intel);
        noData.show(!subject ? 'NO TARGET' : key ? '' : 'NO DATA');
    });
    loop.start();
    return () => {
        loop.stop();
        stopSnapshots();
        stopPanels();
    };
}

function formatAge(seconds: number) {
    const whole = Math.max(0, Math.floor(seconds));
    return whole < 60 ? `${whole}s` : `${Math.floor(whole / 60)}m ${whole % 60}s`;
}

function drawSubjectHeader(container: WidgetContainer, spaceDriver: SpaceDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Target');
    const trackProp = propertyStub('—');
    addTextBlade(pane, trackProp, { label: 'Track' }, cleanup.add).element.classList.add('sw-big');
    const typeProp = propertyStub('—');
    addTextBlade(pane, typeProp, { label: 'Type' }, cleanup.add).element.classList.add('sw-mode');
    const factionProp = propertyStub('—');
    addTextBlade(pane, factionProp, { label: 'Faction' }, cleanup.add).element.classList.add('sw-mode');
    const modelProp = propertyStub('—');
    addTextBlade(pane, modelProp, { label: 'Model' }, cleanup.add);
    const scanLevelProp = propertyStub('—');
    addTextBlade(pane, scanLevelProp, { label: 'Scan level' }, cleanup.add).element.classList.add('sw-mode');
    const intelProp = propertyStub('—');
    const intelBlade = addTextBlade(pane, intelProp, { label: 'Intel' }, cleanup.add);
    intelBlade.element.classList.add('sw-mode');

    return {
        show(subject: SpaceObject | undefined, scanLevel: ScanLevel | undefined, intel: string) {
            if (!subject || scanLevel === undefined) {
                for (const prop of [trackProp, typeProp, factionProp, modelProp, scanLevelProp, intelProp]) {
                    prop.setValue('—');
                }
                intelBlade.element.dataset.tone = '';
                return;
            }
            // identity is BASIC-gated, as on the Signals Contact panel
            const identified = scanLevel >= ScanLevel.BASIC;
            trackProp.setValue(subject.id);
            typeProp.setValue(identified ? subject.type : 'UFO');
            factionProp.setValue(identified ? Faction[subject.faction] || 'Unknown' : 'Unknown');
            const ship = identified ? spaceDriver.state.getShip(subject.id) : undefined;
            modelProp.setValue(ship?.model ?? '—');
            scanLevelProp.setValue(ScanLevel[scanLevel]);
            intelProp.setValue(intel);
            intelBlade.element.dataset.tone = intel === 'LIVE' ? '' : 'caution';
        },
    };
}

function drawNoData(container: WidgetContainer) {
    const element = $('<div />')
        .attr('data-id', 'No Data')
        .css({
            padding: '24px',
            textAlign: 'center',
            color: hsl.primary.main(3),
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
        });
    container.getElement().append(element);
    return {
        show(text: string) {
            element.text(text).toggle(!!text);
        },
    };
}
