import { Container } from 'golden-layout';
declare module 'golden-layout' {
  interface ContentItem extends EventEmitter {
    container: Container;
  }
  interface ReactProps {
    glContainer: Container;
    glEventHub : EventEmitter;
  }
}
