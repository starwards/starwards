import { Radar } from './radar';

const radar = new Radar();
radar.interpolation = true;
document.body.appendChild(radar.view);

// allow to resize viewport and renderer
window.onresize = () => {
    radar.resizeWindow(window.innerWidth, window.innerHeight);

    // radar.viewport.resize(window.innerWidth, window.innerHeight);
    // radar.renderer.resize(window.innerWidth, window.innerHeight);
};

// toggle interpolation
document.addEventListener('click', e => {
    const input = e.target as HTMLInputElement;

    if (input.id === 'interpolation') {
        radar.interpolation = input.checked;
    }
});
