import GoldenLayout, { Container, ContentItem, ReactProps, Tab } from 'golden-layout';
import React, { ComponentClass } from 'react';

import $ from 'jquery';
import ReactDOM from 'react-dom';

type Obj = Record<string, unknown>;
declare global {
    interface Window {
        React: typeof React;
        ReactDOM: typeof ReactDOM;
    }
}
window.React = React;
window.ReactDOM = ReactDOM;

export type MakeHeaders<T> = (container: Container, state: T) => Array<JQuery<HTMLElement>>;

export type GLComponent<T> = { new (container: Container, state: T): unknown };

export interface DashboardWidget<T = Obj> {
    name: string;
    type: 'component' | 'react-component';
    component: GLComponent<T> | ComponentClass<T & ReactProps>;
    defaultProps: Partial<T>;
    makeHeaders?: MakeHeaders<T>;
}
export class Dashboard extends GoldenLayout {
    private widgets: Array<DashboardWidget> = [];

    constructor(
        configuration: GoldenLayout.Config,
        container: JQuery,
        private dragContainer: JQuery<HTMLElement> | null
    ) {
        super(configuration, container);
        if (!this.dragContainer?.length) {
            this.dragContainer = null;
        }
        this.on('stackCreated', this.onNewStack);
        this.container.on('resize', this.resize);
        window.addEventListener('resize', this.resize);
    }

    private readonly onNewStack = (stack: ContentItem & Tab) => {
        stack.on('activeContentItemChanged', (contentItem: ContentItem) => {
            // clean up any outdated widget headers
            stack.header.controlsContainer.find('.widget_header').detach();
            if (contentItem) {
                for (const widget of this.widgets) {
                    if (widget.makeHeaders && contentItem.config.id === widget.name) {
                        const headers = widget.makeHeaders(contentItem.container, widget.defaultProps);
                        for (const header of headers.reverse()) {
                            stack.header.controlsContainer.prepend($('<li class="widget_header"></li>').append(header));
                        }
                    }
                }
            }
        });
    };

    private readonly resize = () => {
        this.updateSize(this.container.width(), this.container.height());
    };

    public setup(): void {
        this.destroy();
        if (this.dragContainer) {
            this.dragContainer.empty();
        }
        try {
            super.init();
            for (const widget of this.widgets) {
                const newItemConfig = getGoldenLayoutItemConfig(widget);
                this.registerWidgetMenuItem(widget.name, newItemConfig);
            }
            // eslint-disable-next-line no-empty
        } catch (e) {}
    }

    public registerWidget<T>(
        { name: wName, component, type, defaultProps, makeHeaders }: DashboardWidget<T>,
        props: Partial<T> = {},
        name?: string
    ) {
        name = name || wName;
        this.registerComponent(name, component);
        this.widgets.push({
            name,
            type,
            component,
            defaultProps: { ...defaultProps, ...props },
            makeHeaders,
        } as DashboardWidget);
    }

    private registerWidgetMenuItem(name: string, newItemConfig: GoldenLayout.ItemConfigType) {
        if (this.dragContainer) {
            const menuItem = $('<li>' + name + '</li>');
            this.dragContainer.append(menuItem);
            this.createDragSource(menuItem, newItemConfig);
        }
    }
}

export function getGoldenLayoutItemConfig({
    name,
    defaultProps,
    type,
}: Pick<DashboardWidget, 'name' | 'defaultProps' | 'type'>) {
    const newItemConfig = {
        id: name,
        title: name,
        type,
    } as GoldenLayout.ItemConfigType;

    if (type === 'react-component') {
        (newItemConfig as GoldenLayout.ReactComponentConfig).component = name;
        (newItemConfig as GoldenLayout.ReactComponentConfig).props = defaultProps;
    } else {
        (newItemConfig as GoldenLayout.ComponentConfig).componentName = name;
        (newItemConfig as GoldenLayout.ComponentConfig).componentState = defaultProps;
    }
    return newItemConfig;
}
