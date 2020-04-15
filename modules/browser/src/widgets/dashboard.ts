import GoldenLayout, { Container, ContentItem, Tab, ReactProps } from 'golden-layout';
import $ from 'jquery';
import { ComponentClass } from 'react';
import React from 'react';
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
    initialState: T;
    makeHeaders?: MakeHeaders;
}
export class Dashboard extends GoldenLayout {
    public setup(): void {
        this.on('stackCreated', (stack: ContentItem & Tab) => {
            stack.on('activeContentItemChanged', () =>
                // clean up any outdated widget headers
                stack.header.controlsContainer.find('.widget_header').detach()
            );
        });
        super.init();
    }

    public registerWidget<T extends object>({ name, component, type, initialState, makeHeaders }: DashboardWidget<T>) {
        this.registerComponent(name, component);
        this.registerWidgetMenuItem(name, initialState, type);
        if (makeHeaders) {
            this.registerWidgetHeaders(name, makeHeaders);
        }
    }

    private registerWidgetMenuItem(name: string, initialState: object, type: DashboardWidget['type']) {
        const menuItem = $('<li>' + name + '</li>');
        $('#menuContainer').append(menuItem);

        const newItemConfig = {
            id: name,
            title: name,
            type,
        } as any;

        if (type === 'react-component') {
            newItemConfig.component = name;
            newItemConfig.props = initialState;
        } else {
            newItemConfig.componentName = name;
            newItemConfig.componentState = initialState;
        }
        this.createDragSource(menuItem, newItemConfig);
    }

    private registerWidgetHeaders(name: string, makeHeaders: MakeHeaders) {
        this.on('stackCreated', (stack: ContentItem & Tab) =>
            stack.on('activeContentItemChanged', (contentItem: ContentItem) => {
                if (contentItem && contentItem.config.id === name) {
                    const headers = makeHeaders(contentItem.container);
                    for (const header of headers.reverse()) {
                        stack.header.controlsContainer.prepend($('<li class="widget_header"></li>').append(header));
                    }
                }
            })
        );
    }
}
