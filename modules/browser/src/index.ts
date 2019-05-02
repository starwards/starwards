import { Radar } from './radar';

const radar = new Radar(window.innerWidth - 300, window.innerHeight);
radar.interpolation = true;
document.body.appendChild(radar.view);

radar.events.on('screenChanged', () => document.getElementById('zoom')!.innerHTML = `zoom ` + radar.pov.zoom);
// allow to resize viewport and renderer
window.onresize = () => {
    radar.resizeWindow(window.innerWidth - 300, window.innerHeight);
};
window.addEventListener('wheel', e => {
    e.stopPropagation();
    e.preventDefault();
    radar.changeZoom(-e.deltaY);
}, {passive : false});

// toggle interpolation
document.addEventListener('click', e => {
    const input = e.target as HTMLInputElement;

    if (input.id === 'interpolation') {
        radar.interpolation = input.checked;
    }
});
