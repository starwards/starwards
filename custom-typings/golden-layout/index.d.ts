import { Container } from 'golden-layout';
declare module 'golden-layout' {
  interface ContentItem extends EventEmitter {
    container: Container;
  }
}
