import GoldenLayout, { Container, ContentItem, ReactProps, Tab } from 'golden-layout';
import $ from 'jquery';
import React, { ComponentClass } from 'react';
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

export type GLComponent<T> = (container: Container, state: T) => void;

export interface DashboardWidget<T extends Obj = Obj> {
    name: string;
    type: 'component' | 'react-component';
    component: GLComponent<T> | ComponentClass<T & ReactProps>;
    defaultProps: Partial<T>;
    makeHeaders?: MakeHeaders<T>;
}
export class Dashboard extends GoldenLayout {
    private dragContainer: JQuery<HTMLElement> | null = null;
    private widgets: Array<DashboardWidget> = [];

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

    public setDragContainer(dragSource: JQuery<HTMLElement>) {
        if (dragSource.length) {
            this.dragContainer = dragSource;
        }
    }

    public setup(): void {
        this.destroy();
        if (this.dragContainer) {
            this.dragContainer.empty();
        }
        this.on('stackCreated', this.onNewStack);
        try {
            super.init();
            for (const widget of this.widgets) {
                this.registerWidgetMenuItem(widget.name, widget.defaultProps, widget.type);
            }
            // eslint-disable-next-line no-empty
        } catch (e) {}
    }

    public registerWidget<T extends Obj>(
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

    private registerWidgetMenuItem(name: string, props: Obj, type: DashboardWidget['type']) {
        if (this.dragContainer) {
            const menuItem = $('<li>' + name + '</li>');
            this.dragContainer.append(menuItem);

            const newItemConfig = {
                id: name,
                title: name,
                type,
            } as GoldenLayout.ItemConfigType;

            if (type === 'react-component') {
                (newItemConfig as GoldenLayout.ReactComponentConfig).component = name;
                (newItemConfig as GoldenLayout.ReactComponentConfig).props = props;
            } else {
                (newItemConfig as GoldenLayout.ComponentConfig).componentName = name;
                (newItemConfig as GoldenLayout.ComponentConfig).componentState = props;
            }
            this.createDragSource(menuItem, newItemConfig);
        }
    }
}
