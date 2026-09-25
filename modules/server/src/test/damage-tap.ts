import { HeadlessGame } from './headless-game';

/**
 * Observes every ship `SpaceManager.convertToDerelict` actually converts: combat deaths, and the
 * write-offs a scenario applies the same way. Pass-through.
 */
export function tapDerelicts(game: HeadlessGame, onConverted: (shipId: string) => void) {
    const { spaceManager } = game;
    const convert = spaceManager.convertToDerelict.bind(spaceManager);
    spaceManager.convertToDerelict = (id: string) => {
        const wasLive = spaceManager.state.getShip(id)?.destroyed === false;
        convert(id);
        if (wasLive && spaceManager.state.getShip(id)?.destroyed) {
            onConverted(id);
        }
    };
}
