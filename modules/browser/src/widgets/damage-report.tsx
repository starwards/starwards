import React, { Component, useEffect } from 'react';
import { defectReadProp, useProperties } from '../react/hooks';

import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/core';
import { WidgetContainer } from '../container';
import { createMachine } from 'xstate';
import { createRoot } from 'react-dom/client';
import { getBrokenSystems } from './damage-report-logic';
import { readProp } from '../property-wrappers';
import { useMachine } from '@xstate/react';

const duration = { exit: 1000 };

const disappearMachine = createMachine({
    id: 'disappear',
    initial: 'hide',
    states: {
        show: {
            on: { false: 'exiting' },
        },
        exiting: {
            on: { true: 'show' },
            after: {
                [duration.exit]: { target: 'hide' },
            },
        },
        hide: {
            on: { true: 'show' },
        },
    },
});

function SystemStatusReport({ name, status, isOk }: { name: string; status: string; isOk: boolean }) {
    const broken = !isOk;
    const [current, send] = useMachine(disappearMachine);

    useEffect(() => {
        send({ type: String(broken) });
    }, [broken, send]);

    if (current.matches('hide')) {
        return null;
    }
    return (
        <div className="sw-damage__entry sw-damage__entry--caution">
            {name} — {status}
        </div>
    );
}
function SystemOfflineReport({ name }: { name: string }) {
    return <div className="sw-damage__entry sw-damage__entry--warning">{name} — OFFLINE</div>;
}

function AllReports({ driver }: { driver: ShipDriver }) {
    const defectsState = useProperties(driver.systems.flatMap((s) => s.defectibles).map(defectReadProp(driver))).sort(
        (a, b) => a.alertTime - b.alertTime,
    );
    useProperties(driver.systems.map((s) => readProp<boolean>(driver, `${s.pointer}/broken`)));
    const brokenSystems = getBrokenSystems(driver.systems);
    return (
        <div className="sw-damage">
            <div className="sw-damage__title">Damage Report</div>
            {brokenSystems.map((s) => (
                <SystemOfflineReport key={s.pointer} name={s.name} />
            ))}
            {defectsState.map((d) => (
                <SystemStatusReport key={d.pointer} name={d.name} status={d.status} isOk={d.isOk} />
            ))}
        </div>
    );
}

export function damageReportWidget(shipDriver: ShipDriver): DashboardWidget {
    class DamageReport extends Component {
        render() {
            return <AllReports driver={shipDriver} />;
        }
    }

    return {
        name: 'damage report',
        type: 'react-component',
        component: DamageReport,
        defaultProps: {},
    };
}

/**
 * Mounts the damage report into a fixed-grid station container (`wrapRootWidgetContainer` +
 * `stationGrid`, e.g. `screens/engineer.ts`) rather than a golden-layout `Dashboard` — the two
 * layout systems don't mix (see CLAUDE.md), so this bypasses `Dashboard.registerWidget` and
 * renders the same React component directly into the container.
 *
 * React mounts into its own dedicated child `<div>`, not the container's element itself — that
 * element is already under a `ResizeSensor` (`wrapWidgetContainer`, `container.ts`) which injects
 * its own child DOM, and React reconciliation only ever expects to own the children it rendered
 * (same reason `input/hotkey-help.ts`'s `createRoot` gets a freshly created div, not `document.body`).
 */
export function drawDamageReport(container: WidgetContainer, shipDriver: ShipDriver) {
    const { component, defaultProps } = damageReportWidget(shipDriver);
    const parent = container.getElement();
    parent.attr('data-id', 'Damage');
    const mountPoint = document.createElement('div');
    parent.append(mountPoint);
    const root = createRoot(mountPoint);
    root.render(React.createElement(component as React.ComponentType, defaultProps));
    container.on('destroy', () => {
        root.unmount();
        mountPoint.remove();
    });
}
