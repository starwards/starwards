import { Scene, scenes } from './scenes';

import { ListBladeApi } from 'tweakpane';
import { createPane } from '../panel';

declare global {
    interface Window {
        __PIXI_READY__: boolean;
        __PIXI_SCENE__: Scene | null;
    }
}

const container = document.getElementById('container')!;
const errorDiv = document.getElementById('error')!;
const sceneListDiv = document.getElementById('scene-list')!;
const panelContainer = document.getElementById('panel-container')!;

const params = new URLSearchParams(window.location.search);
let currentSceneName = params.get('scene');

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
        showError(`Unknown scene: "${currentSceneName}". Select from the list.`);
        return;
    }

    try {
        await scene.setup(container);
        window.__PIXI_SCENE__ = scene;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                window.__PIXI_READY__ = true;
            });
        });
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
