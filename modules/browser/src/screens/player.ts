import { AlphaFilter, Graphics, UPDATE_PRIORITY } from 'pixi.js';
import { Faction, Projectile, SpaceObject, createLogger } from '@starwards/core';
import { PLAYBACK_RATES, ReplayClock } from '../replay/replay-clock';
import { blue, radarVisibleBg, red, white, yellow } from '../colors';
import { tacticalDrawFunctions, tacticalDrawWaypoints } from '../radar/blips/blip-renderer';

import $ from 'jquery';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { GridLayer } from '../radar/grid-layer';
import { InteractiveLayer } from '../radar/interactive-layer';
import { InteractiveLayerCommands } from '../radar/interactive-layer-commands';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { RadarRangeFilter } from '../radar/blips/radar-range-filter';
import { RecordingSource } from '../replay/recording-source';
import { ReplaySpaceDriver } from '../replay/replay-space-driver';
import { SelectionContainer } from '../radar/selection-container';
import { wrapRootWidgetContainer } from '../container';

const { error: logError } = createLogger('screen:player');

function formatTime(seconds: number) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function factionColor(faction: Faction) {
    switch (faction) {
        case Faction.Gravitas:
            return red;
        case Faction.Raiders:
            return blue;
        default:
            return yellow;
    }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
}

function showEmptyState(root: HTMLElement, onFile: (name: string, text: string) => void, message?: string) {
    root.replaceChildren();
    const zone = el('div', { class: 'player-empty', 'data-id': 'drop zone' });
    zone.append(el('h1', {}, 'Recording player'));
    zone.append(el('p', {}, 'Drop a .swr.jsonl recording here, or choose one.'));
    const input = el('input', { type: 'file', accept: '.jsonl,.swr.jsonl', 'data-id': 'file input' });
    zone.append(input);
    if (message) zone.append(el('p', { class: 'player-error', 'data-id': 'load error' }, message));
    const load = async (file: File | undefined) => {
        if (file) onFile(file.name, await file.text());
    };
    input.addEventListener('change', () => void load(input.files?.[0]));
    zone.addEventListener('dragover', (e) => e.preventDefault());
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        void load(e.dataTransfer?.files[0]);
    });
    root.append(zone);
}

class Player {
    private clock: ReplayClock;
    private replay: ReplaySpaceDriver;
    private selection = new SelectionContainer();
    private camera = new Camera();
    private follow = false;
    private interpolate = true;
    private ui!: ReturnType<typeof Player.buildUi>;
    private inspectorSignature = '';
    private detailViews = new Map<SpaceObject, HTMLElement>();

    constructor(
        private root: HTMLElement,
        private source: RecordingSource,
    ) {
        this.clock = new ReplayClock(source.duration);
        this.replay = new ReplaySpaceDriver(source);
        this.camera.setZoom(0.05);
    }

    static buildUi(root: HTMLElement, source: RecordingSource) {
        root.replaceChildren();
        const stage = el('div', { class: 'player-stage', 'data-id': 'player stage' });
        const side = el('aside', { class: 'player-side', 'data-id': 'inspector' });
        const main = el('div', { class: 'player-main' });
        main.append(stage, side);

        const bar = el('div', { class: 'player-bar', 'data-id': 'transport' });
        const scrubber = el('input', {
            type: 'range',
            min: '0',
            max: `${source.duration}`,
            step: 'any',
            value: '0',
            class: 'player-scrubber',
            'data-id': 'scrubber',
            'aria-label': 'timeline',
        });
        const controls = el('div', { class: 'player-controls' });
        const button = (id: string, label: string, title: string) =>
            el('button', { type: 'button', 'data-id': id, title, 'aria-label': title }, label);
        const play = button('play', '▶', 'Play/Pause (space)');
        const back = button('step back', '⏮', 'Previous frame (,)');
        const fwd = button('step forward', '⏭', 'Next frame (.)');
        const time = el('span', { class: 'player-time', 'data-id': 'time' }, '00:00');
        const rate = el('select', { 'data-id': 'rate', title: 'Playback speed (J/L)' });
        for (const r of PLAYBACK_RATES) {
            const option = el('option', { value: `${r}` }, `${r}×`);
            if (r === 1) option.setAttribute('selected', '');
            rate.append(option);
        }
        const followBtn = button('follow', '◎', 'Follow selection (F)');
        followBtn.classList.add('toggle');
        const interpBtn = button('interpolate', '≈', 'Smooth motion between frames');
        interpBtn.classList.add('toggle', 'on');
        const title = el('span', { class: 'player-title', 'data-id': 'recording title' });
        title.textContent = `${source.name} · ${source.header.mapName}`;
        controls.append(play, back, fwd, time, rate, followBtn, interpBtn, title);
        bar.append(scrubber, controls);
        root.append(main, bar);
        return { stage, side, scrubber, play, back, fwd, time, rate, followBtn, interpBtn };
    }

    async start() {
        this.ui = Player.buildUi(this.root, this.source);
        await this.initRadar();
        this.bindControls();
        this.source.onFrameLoaded = () => this.render();
        this.clock.events.on('change', () => this.render());
        this.render();
    }

    private async initRadar() {
        const { stage } = this.ui;
        const container = wrapRootWidgetContainer($(stage));
        const root = new CameraView(this.camera);
        await root.initialize({ backgroundColor: radarVisibleBg }, container);
        root.canvas.setAttribute('data-id', 'GM Radar');
        stage.addEventListener(
            'wheel',
            (e) => {
                e.preventDefault();
                this.camera.changeZoom(-e.deltaY);
            },
            { passive: false },
        );
        root.events.on('screenChanged', () => root.canvas.setAttribute('data-zoom', `${this.camera.zoom}`));

        const spaceDriver = this.replay.driver;
        this.selection.init(spaceDriver);
        root.addLayer(new GridLayer(root).renderRoot);

        const rangeFilter = new RadarRangeFilter(spaceDriver);
        root.ticker.add(rangeFilter.update, null, UPDATE_PRIORITY.LOW);
        for (let faction: Faction = 0; faction < Faction.FACTION_COUNT; faction++) {
            const fov = new Graphics();
            fov.filters = [new AlphaFilter({ alpha: 0.1 })];
            root.addLayer(fov);
            root.ticker.add(
                () => {
                    fov.clear();
                    for (const f of rangeFilter.fieldsOfView()) {
                        if (f.object.faction === faction) {
                            f.draw(root, fov);
                            fov.fill({ color: factionColor(faction), alpha: 1 });
                        }
                    }
                },
                null,
                UPDATE_PRIORITY.LOW,
            );
        }
        const color = (s: SpaceObject) => (Projectile.isInstance(s) ? white : factionColor(s.faction));
        root.addLayer(new ObjectsLayer(root, spaceDriver, 64, color, tacticalDrawFunctions, this.selection).renderRoot);
        root.addLayer(
            new ObjectsLayer(root, spaceDriver, 32, (w) => w.color, tacticalDrawWaypoints, this.selection).renderRoot,
        );
        root.addLayer(
            new InteractiveLayer(root, spaceDriver, this.selection, new InteractiveLayerCommands(), true).renderRoot,
        );
        // the recording is applied before layers read the state on each tick
        root.ticker.add(() => this.frame(), null, UPDATE_PRIORITY.HIGH);
        this.selection.events.on('changed', () => this.renderInspector());
    }

    private frame() {
        if (!this.replay.update(this.clock.position, this.interpolate)) return;
        for (const [object, view] of this.detailViews) {
            view.textContent = JSON.stringify(object.toJSON(), null, 1);
        }
        if (this.follow) {
            const selected = this.selection.getSingle();
            if (selected) this.camera.set(selected.position);
        }
    }

    private bindControls() {
        const { play, back, fwd, rate, scrubber, followBtn, interpBtn } = this.ui;
        const step = (dir: number) => {
            this.clock.pause();
            const i = this.source.indexAt(this.clock.position);
            const current = this.source.timeOf(i);
            const target = dir > 0 || this.clock.position > current + 1e-6 ? i + dir : i - 1;
            this.clock.seek(this.source.timeOf(Math.max(0, Math.min(target, this.source.frameCount - 1))));
        };
        play.addEventListener('click', () => this.clock.toggle());
        back.addEventListener('click', () => step(-1));
        fwd.addEventListener('click', () => step(1));
        rate.addEventListener('change', () => this.clock.setRate(Number(rate.value)));
        scrubber.addEventListener('input', () => this.clock.seek(Number(scrubber.value)));
        const toggleFollow = () => {
            this.follow = !this.follow;
            followBtn.classList.toggle('on', this.follow);
        };
        followBtn.addEventListener('click', toggleFollow);
        interpBtn.addEventListener('click', () => {
            this.interpolate = !this.interpolate;
            interpBtn.classList.toggle('on', this.interpolate);
        });
        const changeRate = (dir: number) => {
            const i = PLAYBACK_RATES.findIndex((r) => r === this.clock.rate);
            const next = PLAYBACK_RATES[Math.max(0, Math.min(PLAYBACK_RATES.length - 1, i + dir))];
            this.clock.setRate(next);
            rate.value = `${next}`;
        };
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'SELECT') return;
            const inScrubber = target === scrubber;
            switch (e.key) {
                case ' ':
                case 'k':
                    if (target.tagName === 'BUTTON') return; // let the button handle its own activation
                    e.preventDefault();
                    this.clock.toggle();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.clock.seekBy(inScrubber ? -1 : -5);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.clock.seekBy(inScrubber ? 1 : 5);
                    break;
                case ',':
                    step(-1);
                    break;
                case '.':
                    step(1);
                    break;
                case 'j':
                    changeRate(-1);
                    break;
                case 'l':
                    changeRate(1);
                    break;
                case 'Home':
                    this.clock.seek(0);
                    break;
                case 'End':
                    this.clock.seek(this.source.duration);
                    break;
                case 'f':
                    toggleFollow();
                    break;
                case 'Escape':
                    this.selection.clear();
                    break;
            }
        });
    }

    private render() {
        const { play, time, scrubber } = this.ui;
        play.textContent = this.clock.playing ? '⏸' : this.clock.ended ? '↺' : '▶';
        time.textContent = `${formatTime(this.clock.position)} / ${formatTime(this.source.duration)}`;
        if (document.activeElement !== scrubber || !this.clock.playing) {
            scrubber.value = `${this.clock.position}`;
        }
        scrubber.style.setProperty('--progress', `${(this.clock.position / (this.source.duration || 1)) * 100}%`);
        this.renderInspector();
    }

    private renderInspector() {
        const { side } = this.ui;
        const selected = [...this.selection.selectedItems];
        const objects = [...this.replay.state];
        const signature = `${objects.map((o) => o.id).join()}|${selected.map((o) => o.id).join()}`;
        if (signature === this.inspectorSignature) return;
        this.inspectorSignature = signature;
        side.replaceChildren();
        this.detailViews.clear();

        const details = el('section', { class: 'player-details', 'data-id': 'selection details' });
        if (selected.length === 0) {
            details.append(el('p', { class: 'hint' }, 'Click an object to inspect it.'));
        }
        for (const object of selected.slice(0, 3)) {
            details.append(el('h3', {}, `${object.type} ${object.id}`));
            const pre = el('pre');
            pre.textContent = JSON.stringify(object.toJSON(), null, 1);
            this.detailViews.set(object, pre);
            details.append(pre);
        }
        if (selected.length > 3) details.append(el('p', { class: 'hint' }, `+${selected.length - 3} more selected`));

        const list = el('section', { class: 'player-list', 'data-id': 'object list' });
        list.append(el('h3', {}, `Objects (${objects.length})`));
        const sorted = objects.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
        for (const object of sorted.slice(0, 300)) {
            const row = el('button', { type: 'button', class: 'row', 'data-id': `object ${object.id}` });
            row.textContent = `${object.type} ${object.id}`;
            if (this.selection.has(object)) row.classList.add('selected');
            row.addEventListener('click', () => {
                this.selection.set([object]);
                this.camera.set(object.position);
            });
            list.append(row);
        }
        side.append(details, list);
    }
}

function startPlayer(root: HTMLElement) {
    const open = (name: string, text: string) => {
        try {
            const source = RecordingSource.parse(name, text);
            new Player(root, source).start().catch((e) => {
                logError('player failed', e);
                showEmptyState(root, open, `Failed to start: ${String(e)}`);
            });
        } catch (e) {
            showEmptyState(root, open, `Not a valid recording: ${String(e)}`);
        }
    };
    showEmptyState(root, open);
    const src = new URLSearchParams(window.location.search).get('src');
    if (src) {
        fetch(src)
            .then((r) => r.text())
            .then((text) => open(src.split('/').pop() ?? src, text))
            .catch((e) => showEmptyState(root, open, `Failed to fetch ${src}: ${String(e)}`));
    }
}

const rootEl = document.getElementById('player');
if (rootEl) startPlayer(rootEl);
