import { Driver, Faction, ScanLevel, SpaceDriver, SpaceObject, Spaceship, playerScanLevel } from '@starwards/core';
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
 * target's own room; at every lower level it shows "no data". No hotkeys, no commands.
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

    // internals slots are created per subject and removed on teardown, which disposes their panes
    let liveSubjectId: string | undefined;
    let teardownLive: (() => void) | undefined;
    const stopLive = () => {
        teardownLive?.();
        teardownLive = undefined;
        liveSubjectId = undefined;
    };

    function startLive(subjectId: string) {
        liveSubjectId = subjectId;
        void driver.getShipDriver(subjectId).then((subjectDriver) => {
            if (liveSubjectId !== subjectId) return; // subject changed (or screen torn down) while awaiting
            const armorSlot = grid.center({ fill: true });
            const tubesSlot = grid.left({ scroll: true });
            const systemsSlot = grid.right({ scroll: true });
            const armorApp = drawArmorStatus(armorSlot, subjectDriver, 300);
            drawTargetTubes(tubesSlot, subjectDriver);
            drawFullSystemsStatus(systemsSlot, subjectDriver, subjectDriver.systems, true);
            teardownLive = () => {
                void armorApp.then((app) => app.destroy({ removeView: true }, true));
                for (const slot of [armorSlot, tubesSlot, systemsSlot]) slot.getElement().remove();
            };
        });
    }

    const loop = new EmitterLoop(200);
    loop.onLoop(() => {
        const subject = spaceDriver.state.get(shipDriver.state.signalsTargetId);
        const scanLevel = subject ? playerScanLevel(subject, shipDriver.state.faction) : undefined;
        header.show(subject, scanLevel);
        const live = subject && scanLevel !== undefined && scanLevel >= ScanLevel.FULL && Spaceship.isInstance(subject);
        if (live) {
            if (subject.id !== liveSubjectId) {
                stopLive();
                startLive(subject.id);
            }
        } else if (liveSubjectId) {
            stopLive();
        }
        noData.show(!subject ? 'NO TARGET' : live ? '' : 'NO DATA');
    });
    loop.start();
    return () => {
        loop.stop();
        stopLive();
    };
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
        show(subject: SpaceObject | undefined, scanLevel: ScanLevel | undefined) {
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
            const live = scanLevel >= ScanLevel.FULL && Spaceship.isInstance(subject);
            intelProp.setValue(live ? 'LIVE' : 'NO DATA');
            intelBlade.element.dataset.tone = live ? '' : 'caution';
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
