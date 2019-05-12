import GoldenLayout from 'golden-layout';
import { ContentItem, Tab } from 'golden-layout';
import $ from 'jquery';
import {loadRadarComponent} from './radar';

const config = {
  content: []
};

const myLayout = new GoldenLayout(config, $('#layoutContainer'));

myLayout.on('stackCreated', function(stack: ContentItem & Tab) {
  /*
   * Listening for activeContentItemChanged. This happens initially
   * when the stack is created and everytime the user clicks a tab
   */
  stack.on('activeContentItemChanged',
    () => stack.header.controlsContainer.find('.custom_controls').detach());
});

myLayout.init();
export type HeadersInit = (stack: ContentItem & Tab, contentItem: ContentItem) => void;

function addMenuItem(name: string, initialState: object, setHeaders?: HeadersInit) {
  const element = $('<li>' + name + '</li>');
  $('#menuContainer').append(element);

  const newItemConfig = {
    id: name,
    title: name,
    type: 'component',
    componentName: name,
    componentState: initialState
  };
  myLayout.createDragSource(element, newItemConfig);

  if (setHeaders) {
    myLayout.on('stackCreated', function(stack: ContentItem & Tab) {
      stack.on('activeContentItemChanged', function(contentItem: ContentItem) {
        if (contentItem && contentItem.config.id === name) {
          setHeaders(stack, contentItem);
        }
      });
    });
  }
}

function registerComponent(name: string, component: any, initialState: object, setHeaders?: HeadersInit) {
  myLayout.registerComponent(name, component);
  addMenuItem(name, initialState, setHeaders);
}

export type Registrar = (name: string, component: any, initialState: object, setHeaders?: HeadersInit) => void;
loadRadarComponent(registerComponent);
