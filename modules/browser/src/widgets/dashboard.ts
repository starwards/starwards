// tslint:disable: max-classes-per-file
import GoldenLayout, { Container, ContentItem, ReactProps, Tab } from 'golden-layout';
import $ from 'jquery';
import React, { ComponentClass } from 'react';
import ReactDOM from 'react-dom';

declare global {
    interface Window {
        React: typeof React;
        ReactDOM: typeof ReactDOM;
    }
}
window.React = React;
window.ReactDOM = ReactDOM;

export type MakeHeaders = (container: Container) => Array<JQuery<HTMLElement>>;

export type GLComponent<T> = (container: Container, state: T) => void;

export interface DashboardWidget<T extends object = object> {
    name: string;
    type: 'component' | 'react-component';
    component: GLComponent<T> | ComponentClass<T & ReactProps>;
    defaultProps: Partial<T>;
    makeHeaders?: MakeHeaders;
}
export class Dashboard extends GoldenLayout {
    private dragContainer: JQuery<HTMLElement> | null = null;
    private widgets: Array<DashboardWidget<any>> = [];

    private readonly onNewStack = (stack: ContentItem & Tab) => {
        stack.on('activeContentItemChanged', (contentItem: ContentItem) => {
            // clean up any outdated widget headers
            stack.header.controlsContainer.find('.widget_header').detach();
            if (contentItem) {
                for (const widget of this.widgets) {
                    if (widget.makeHeaders && contentItem.config.id === widget.name) {
                        const headers = widget.makeHeaders(contentItem.container);
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
            // tslint:disable-next-line: no-empty
        } catch (e) {
            console.log('ggg', e);
        }
    }

    public registerWidget<T extends object>(
        { name: wName, component, type, defaultProps, makeHeaders }: DashboardWidget<T>,
        props: Partial<T> = {},
        name?: string
    ) {
        name = name || wName;
        this.registerComponent(name, component);
        this.widgets.push({ name, type, component, defaultProps: { ...defaultProps, ...props }, makeHeaders });
    }

    private registerWidgetMenuItem(name: string, props: object, type: DashboardWidget['type']) {
        if (this.dragContainer) {
            const menuItem = $('<li>' + name + '</li>');
            this.dragContainer.append(menuItem);

            const newItemConfig = {
                id: name,
                title: name,
                type,
            } as any;

            if (type === 'react-component') {
                newItemConfig.component = name;
                newItemConfig.props = props;
            } else {
                newItemConfig.componentName = name;
                newItemConfig.componentState = props;
            }
            this.createDragSource(menuItem, newItemConfig);
        }
    }
}
