import { DesignState, ShipDriver } from '@starwards/core';
import { Panel, PropertyPanel } from '../panel';
import { readProp, readWriteProp } from '../property-wrappers';

import $ from 'jquery';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

function addDesignStateToPanel(panel: Panel, shipDriver: ShipDriver, pointerStr: string) {
    const p = readProp<DesignState>(shipDriver, pointerStr);
    const fields = new Set(p.getValue()?.keys());
    for (const constName of fields) {
        panel.addConfig(constName, readWriteProp(shipDriver, pointerStr + '/' + constName));
    }
    p.onChange(() => {
        for (const constName of p.getValue()?.keys() || []) {
            if (!fields.has(constName)) {
                fields.add(constName);
                panel.addConfig(constName, readWriteProp(shipDriver, pointerStr + '/' + constName));
            }
        }
    });
}

export function designStateWidget(shipDriver: ShipDriver): DashboardWidget {
    function makeShipComponent(container: WidgetContainer) {
        const rootPanel = new PropertyPanel(container);
        // TODO add cleanups for folders
        if (shipDriver.state.chainGun) {
            addDesignStateToPanel(rootPanel.addFolder('chainGun'), shipDriver, `/chainGun/design`);
        }
        for (const thruster of shipDriver.state.thrusters) {
            addDesignStateToPanel(
                rootPanel.addFolder(thruster.name, false),
                shipDriver,
                `/thrusters/${thruster.index}/design`,
            );
        }
        addDesignStateToPanel(rootPanel.addFolder('armor'), shipDriver, `/armor/design`);
        addDesignStateToPanel(rootPanel.addFolder('radar'), shipDriver, `/radar/design`);
        addDesignStateToPanel(rootPanel.addFolder('smartPilot'), shipDriver, `/smartPilot/design`);
        addDesignStateToPanel(rootPanel.addFolder('reactor'), shipDriver, `/reactor/design`);
        addDesignStateToPanel(rootPanel.addFolder('magazine'), shipDriver, `/magazine/design`);
        addDesignStateToPanel(rootPanel.addFolder('main'), shipDriver, `/design`);
        rootPanel.addImportExport();
        const cleanup = () => {
            container.off('destroy', cleanup);
            rootPanel.destroy();
        };
        container.on('destroy', cleanup);
    }
    function makeHeaders(container: Container): Array<JQuery<HTMLElement>> {
        const refresh = $('<i class="lm_controls tiny material-icons">refresh</i>');
        refresh.mousedown(() => {
            container.emit('destroy');
            void makeShipComponent(container);
        });
        return [refresh];
    }
    class DesignStateComponent {
        constructor(container: Container, _: unknown) {
            void makeShipComponent(container);
        }
    }

    return {
        name: shipDriver.id + ' design state',
        type: 'component',
        component: DesignStateComponent,
        makeHeaders: makeHeaders,
        defaultProps: {},
    };
}
