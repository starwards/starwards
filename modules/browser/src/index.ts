import GoldenLayout from 'golden-layout';
import { radarComponent as radar } from './radar/radar-component';
import $ from 'jquery';

const config = {
  content: []
};

const myLayout = new GoldenLayout( config, $('#layoutContainer')  );

myLayout.registerComponent( 'radar', radar);

myLayout.init();

const addMenuItem = function( name: string ) {
  const element = $( '<li>' + name + '</li>' );
  $( '#menuContainer' ).append( element );

  const newItemConfig = {
      title: name,
      type: 'component',
      componentName: name,
      componentState: { }
  };

  myLayout.createDragSource( element, newItemConfig );
};

addMenuItem( 'radar' );
