import { Scene, scenes } from './scenes';

import { Application } from 'pixi.js';
import { ListBladeApi } from 'tweakpane';
import { createPane } from '../panel';

declare global {
    interface Window {
        __PIXI_READY__: boolean;
        __PIXI_SCENE__: Scene | null;
        __PIXI_APP__: Application | null;
    }
}

const container = document.getElementById('container')!;
const errorDiv = document.getElementById('error')!;
const sceneListDiv = document.getElementById('scene-list')!;
const panelContainer = document.getElementById('panel-container')!;

const params = new URLSearchParams(window.location.search);
let currentSceneName = params.get('scene');

/**
 * Runs the scene's setup with `setInterval` disarmed. A gallery scene is a still frame of a frozen
 * ship, but Tweakpane graph monitors poll their binding on an interval, so the trace they draw grows
 * with the wall-clock time between building the pane and screenshotting it. Widgets that plot a value
 * would render differently on every visit.
 */
async function setupStillFrame(scene: Scene) {
    const liveSetInterval = window.setInterval;
    window.setInterval = (() => 0) as unknown as typeof window.setInterval;
    try {
        return await scene.setup(container);
    } finally {
        window.setInterval = liveSetInterval;
    }
}

/**
 * Shrinks the container onto what the scene actually drew. The visual tests screenshot this element,
 * so anything outside it is untestable and anything inside it that is not the widget only dilutes the
 * comparison: a widget taller than its container had the overflow cropped out of the frame entirely,
 * and every scene padded the rest of the 1000px-wide flex row with inert background.
 */
function fitContainerToRendering() {
    const children = Array.from(container.children).map((child) => child.getBoundingClientRect());
    if (!children.length) {
        return;
    }
    const width = Math.max(...children.map((r) => r.right)) - Math.min(...children.map((r) => r.left));
    const height = Math.max(...children.map((r) => r.bottom)) - Math.min(...children.map((r) => r.top));
    container.style.flex = '0 0 auto';
    container.style.width = `${Math.ceil(width)}px`;
    container.style.height = `${Math.ceil(height)}px`;
}

/**
 * Displaces the scene's rendered output by `?perturb=<pixels>`, so the visual tests can prove they
 * detect a change in the widget they cover. Zero (the default) leaves the scene untouched.
 */
function perturbRendering() {
    const offset = Number(params.get('perturb'));
    if (!offset) {
        return;
    }
    for (const child of Array.from(container.children)) {
        (child as HTMLElement).style.transform = `translate(${offset}px, ${offset}px)`;
    }
}

function buildSceneSelector() {
    sceneListDiv.style.display = 'none';

    const sceneNames = Object.keys(scenes).sort();
    const sceneOptions = sceneNames.map((name) => ({ text: name, value: name }));

    const pane = createPane({ title: 'Gallery', container: panelContainer });

    const sceneState = { scene: currentSceneName || sceneNames[0] };
    const sceneList = pane.addBlade({
        view: 'list',
        label: 'Scene',
        options: sceneOptions,
        value: sceneState.scene,
    }) as ListBladeApi<string>;

    sceneList.on('change', (ev: { value: string }) => {
        window.location.href = `?scene=${ev.value}`;
    });

    if (currentSceneName && scenes[currentSceneName]) {
        pane.addBlade({
            view: 'text',
            label: 'Description',
            value: scenes[currentSceneName].description,
            parse: (v: string) => v,
        });
    }

    const infoFolder = pane.addFolder({ title: 'Info', expanded: false });
    infoFolder.addBlade({
        view: 'text',
        label: 'Total Scenes',
        value: String(sceneNames.length),
        parse: (v: string) => v,
    });
}

function showError(message: string) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

async function loadScene() {
    window.__PIXI_READY__ = false;
    window.__PIXI_SCENE__ = null;
    window.__PIXI_APP__ = null;

    buildSceneSelector();

    if (!currentSceneName) {
        const firstScene = Object.keys(scenes).sort()[0];
        if (firstScene) {
            window.location.href = `?scene=${firstScene}`;
        }
        return;
    }

    const scene = scenes[currentSceneName];
    if (!scene) {
        const availableScenes = Object.keys(scenes).sort().join(', ');
        showError(`Unknown scene: "${currentSceneName}". Available scenes: ${availableScenes}`);
        return;
    }

    document.title = `${currentSceneName} — Starwards Gallery`;

    try {
        const app = await setupStillFrame(scene);
        fitContainerToRendering();
        perturbRendering();
        window.__PIXI_SCENE__ = scene;
        if (app) {
            window.__PIXI_APP__ = app;
        }

        // Wait for PixiJS to render frames, then stop ticker for stable screenshots
        // preserveDrawingBuffer=true keeps canvas content after ticker stops
        if (window.__PIXI_APP__) {
            let frameCount = 0;
            const waitForRender = () => {
                frameCount++;
                if (frameCount >= 10) {
                    window.__PIXI_APP__!.ticker.remove(waitForRender);
                    window.__PIXI_APP__!.ticker.stop();
                    // Force final render to ensure canvas has content
                    window.__PIXI_APP__!.render();
                    window.__PIXI_READY__ = true;
                }
            };
            window.__PIXI_APP__.ticker.add(waitForRender);
        } else {
            window.__PIXI_READY__ = true;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showError(`Failed to load scene "${currentSceneName}": ${message}`);
    }
}

window.addEventListener('beforeunload', () => {
    if (window.__PIXI_SCENE__?.teardown) {
        window.__PIXI_SCENE__.teardown();
    }
});

void loadScene();
