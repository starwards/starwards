import { Radar } from './radar';
import WebFont from 'webfontloader';

WebFont.load({
  custom: {
    families: ['Bebas']
  }
});
const radar = new Radar(window.innerWidth, window.innerHeight);
radar.interpolation = true;
radar.events.on(
  'screenChanged',
  () =>
    (document.getElementById('zoom')!.innerHTML = `zoom ` + radar.pov.zoom)
);
// allow to resize viewport and renderer
window.onresize = () => {
  radar.resizeWindow(window.innerWidth, window.innerHeight);
};
window.addEventListener(
  'wheel',
  e => {
    e.stopPropagation();
    e.preventDefault();
    radar.changeZoom(-e.deltaY);
  },
  { passive: false }
);
// toggle interpolation
document.addEventListener('click', e => {
  const input = e.target as HTMLInputElement;

  if (input.id === 'interpolation') {
    radar.interpolation = input.checked;
  }
});

document.body.appendChild(radar.view);
