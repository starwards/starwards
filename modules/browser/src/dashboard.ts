import GoldenLayout, { Container, ContentItem, Tab } from 'golden-layout';
import $ from 'jquery';

export type MakeHeaders = (container: Container) => Array<JQuery<HTMLElement>>;

export type Component<T>  = (container: Container, state: T) => void;

export interface DashboardWidget<T extends object> {
  name: string;
  component: Component<T>;
  initialState: T;
  makeHeaders?: MakeHeaders;
}

export class Dashboard extends GoldenLayout {
  public init(): void {
    this.on('stackCreated', (stack: ContentItem & Tab) => {
      stack.on('activeContentItemChanged', () =>
        // clean up any outdated widget headers
        stack.header.controlsContainer.find('.widget_header').detach()
      );
    });
    super.init();
  }

  public registerWidget<T extends object>({
    name,
    component,
    initialState,
    makeHeaders
  }: DashboardWidget<T>) {
    this.registerComponent(name, component);
    this.registerWidgetMenuItem(name, initialState);
    if (makeHeaders) {
      this.registerWidgetHeaders(name, makeHeaders);
    }
  }

  private registerWidgetMenuItem(name: string, initialState: object) {
    const menuItem = $('<li>' + name + '</li>');
    $('#menuContainer').append(menuItem);

    const newItemConfig = {
      id: name,
      title: name,
      type: 'component',
      componentName: name,
      componentState: initialState
    };
    this.createDragSource(menuItem, newItemConfig);
  }

  private registerWidgetHeaders(name: string, makeHeaders: MakeHeaders) {
    this.on('stackCreated', (stack: ContentItem & Tab) =>
      stack.on('activeContentItemChanged', (contentItem: ContentItem) => {
        if (contentItem && contentItem.config.id === name) {
          const headers = makeHeaders(contentItem.container);
          for (const header of headers.reverse()) {
            stack.header.controlsContainer.prepend(
              $('<li class="widget_header"></li>').append(header)
            );
          }
        }
      })
    );
  }
}
