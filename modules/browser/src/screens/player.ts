import { Dashboard, getGoldenLayoutItemConfig } from '../widgets/dashboard';
import { PLAYBACK_RATES, ReplayClock } from '../replay/replay-clock';

import $ from 'jquery';
import { GmWidgets } from '../widgets/gm';
import { RecordingSource } from '../replay/recording-source';
import { ReplayDriver } from '../replay/replay-driver';
import { ReplaySession } from '../replay/replay-session';
import { ammoWidget } from '../widgets/ammo';
import { armorWidget } from '../widgets/armor';
import { createLogger } from '@starwards/core';
import { damageReportWidget } from '../widgets/damage-report';
import { designStateWidget } from '../widgets/design-state';
import { dockingWidget } from '../widgets/docking';
import { engineeringStatusWidget } from '../widgets/enginering-status';
import { fullSystemsStatusWidget } from '../widgets/full-system-status';
import { gunWidget } from '../widgets/gun';
import { helmsRadarWidget } from '../widgets/helms-radar';
import { helmsWidget } from '../widgets/helms';
import { longRangeRadarWidget } from '../widgets/long-range-radar';
import { monitorWidget } from '../widgets/monitor';
import { radarWidget } from '../widgets/radar';
import { repairQueueWidget } from '../widgets/repair-queue';
import { systemsStatusWidget } from '../widgets/system-status';
import { tacticalRadarWidget } from '../widgets/tactical-radar';
import { targetInfoWidget } from '../widgets/target-info';
import { targetRadarWidget } from '../widgets/target-radar';
import { targetingWidget } from '../widgets/targeting';
import { tubesStatusWidget } from '../widgets/tubes-status';
import { warpWidget } from '../widgets/warp';

const { error: logError } = createLogger('screen:player');

function formatTime(seconds: number) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
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

function buildUi(root: HTMLElement, source: RecordingSource) {
    root.replaceChildren();
    // golden-layout fills the stage; `#menuContainer`/`#layoutContainer` get their geometry from index.css
    const stage = el('div', { class: 'player-stage', 'data-id': 'player stage' });
    stage.append(el('ul', { id: 'menuContainer' }), el('div', { id: 'layoutContainer' }));

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
    const interpBtn = button('interpolate', '≈', 'Smooth motion between frames');
    interpBtn.classList.add('toggle', 'on');
    const title = el('span', { class: 'player-title', 'data-id': 'recording title' });
    title.textContent = `${source.name} · ${source.header.mapName}`;
    controls.append(play, back, fwd, time, rate, interpBtn, title);
    bar.append(scrubber, controls);
    root.append(stage, bar);
    return { stage, scrubber, play, back, fwd, time, rate, interpBtn };
}

class Player {
    private clock: ReplayClock;
    private session: ReplaySession;
    private driver: ReplayDriver;
    private ui!: ReturnType<typeof buildUi>;

    constructor(
        private root: HTMLElement,
        private source: RecordingSource,
    ) {
        this.clock = new ReplayClock(source.duration);
        this.session = new ReplaySession(source);
        this.driver = new ReplayDriver(this.session);
    }

    async start() {
        this.ui = buildUi(this.root, this.source);
        // the first frame has to be in the rooms before any driver is made
        await this.source.load(0);
        this.session.update(0);
        this.bindControls();
        this.source.onFrameLoaded = () => this.session.update(this.clock.position);
        this.clock.events.on('change', () => this.render());
        this.render();
        await this.initDashboard();
    }

    private async initDashboard() {
        const { driver } = this;
        const wrapperEl = $(this.ui.stage);
        const spaceDriver = await driver.getSpaceDriver();
        const gmWidgets = new GmWidgets(driver, true);
        const dashboard = new Dashboard(
            {
                content: [
                    {
                        content: [
                            { ...getGoldenLayoutItemConfig(gmWidgets.radar), width: 75, isClosable: false },
                            { ...getGoldenLayoutItemConfig(gmWidgets.tweak), width: 25, isClosable: false },
                        ],
                        isClosable: false,
                        title: '',
                        type: 'row' as const,
                    },
                ],
            },
            wrapperEl.find('#layoutContainer'),
            wrapperEl.find('#menuContainer'),
        );
        dashboard.registerWidget(gmWidgets.radar);
        dashboard.registerWidget(gmWidgets.tweak);
        dashboard.setup();

        // constantly scan for new ships and add widgets for them
        void (async () => {
            for await (const shipId of driver.getUniqueShipIds()) {
                const shipDriver = await driver.getShipDriver(shipId);
                dashboard.registerWidget(radarWidget(spaceDriver, shipDriver), {}, shipId + ' radar');
                dashboard.registerWidget(tacticalRadarWidget(spaceDriver, shipDriver), {}, shipId + ' tactical radar');
                dashboard.registerWidget(helmsRadarWidget(spaceDriver, shipDriver), {}, shipId + ' helms radar');
                dashboard.registerWidget(helmsWidget(shipDriver), {}, shipId + ' helm');
                dashboard.registerWidget(gunWidget(shipDriver), {}, shipId + ' gun');
                dashboard.registerWidget(designStateWidget(shipDriver), { shipDriver }, shipId + ' design state');
                dashboard.registerWidget(targetRadarWidget(spaceDriver, shipDriver), {}, shipId + ' target radar');
                dashboard.registerWidget(monitorWidget(shipDriver), {}, shipId + ' monitor');
                dashboard.registerWidget(damageReportWidget(shipDriver), {}, shipId + ' damage report');
                dashboard.registerWidget(repairQueueWidget(shipDriver), {}, shipId + ' repair queue');
                dashboard.registerWidget(armorWidget(shipDriver), {}, shipId + ' armor');
                dashboard.registerWidget(ammoWidget(shipDriver), {}, shipId + ' ammo');
                dashboard.registerWidget(tubesStatusWidget(shipDriver), {}, shipId + ' tubes');
                dashboard.registerWidget(systemsStatusWidget(shipDriver), {}, shipId + ' systems');
                dashboard.registerWidget(fullSystemsStatusWidget(shipDriver), {}, shipId + ' systems (full)');
                dashboard.registerWidget(engineeringStatusWidget(shipDriver), {}, shipId + ' engineering status');
                dashboard.registerWidget(targetingWidget(shipDriver), {}, shipId + ' targeting');
                if (shipDriver.state.warp) {
                    dashboard.registerWidget(warpWidget(shipDriver), {}, shipId + ' warp');
                }
                dashboard.registerWidget(dockingWidget(spaceDriver, shipDriver), {}, shipId + ' docking');
                dashboard.registerWidget(
                    targetInfoWidget(spaceDriver, shipDriver, driver),
                    {},
                    shipId + ' target info',
                );
                dashboard.registerWidget(
                    longRangeRadarWidget(spaceDriver, shipDriver),
                    {},
                    shipId + ' long range radar',
                );
            }
        })().catch(logError);
    }

    private bindControls() {
        const { play, back, fwd, rate, scrubber, interpBtn } = this.ui;
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
        interpBtn.addEventListener('click', () => {
            this.session.interpolate = !this.session.interpolate;
            interpBtn.classList.toggle('on', this.session.interpolate);
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
            // widgets own their text fields and selects
            if (['SELECT', 'INPUT', 'TEXTAREA'].includes(target.tagName) && target !== scrubber) return;
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
            }
        });
    }

    private render() {
        this.session.update(this.clock.position);
        const { play, time, scrubber } = this.ui;
        play.textContent = this.clock.playing ? '⏸' : this.clock.ended ? '↺' : '▶';
        time.textContent = `${formatTime(this.clock.position)} / ${formatTime(this.source.duration)}`;
        if (document.activeElement !== scrubber || !this.clock.playing) {
            scrubber.value = `${this.clock.position}`;
        }
        scrubber.style.setProperty('--progress', `${(this.clock.position / (this.source.duration || 1)) * 100}%`);
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
