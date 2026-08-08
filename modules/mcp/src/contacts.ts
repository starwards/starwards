import { ScanLevel, SpaceObject, Spaceship, XY, objectDisplayName, playerScanLevel } from '@starwards/core/internal';

/**
 * A contact as a station may report it.
 *
 * The fields present depend on what the station has earned. A blip below BASIC is a return on a
 * scope: it has a position and a size and nothing else. Type, faction, name and heading appear only
 * from BASIC up — naming an unscanned contact by type would classify it for free, which is the same
 * leak the browser's renderers are careful to avoid.
 */
type Contact = {
    id: string;
    /** What the station may call it: its name from BASIC up, otherwise the bare contact id. */
    name: string;
    scanLevel: keyof typeof ScanLevel;
    position: { x: number; y: number };
    /** Metres from the observing ship. */
    distance: number;
    /** Degrees, world bearing from the observing ship. */
    bearing: number;
    radius: number;
    type?: string;
    faction?: number;
    /** Degrees. The direction the contact is facing — the browser's direction indicator. */
    heading?: number;
    /** Set on a contact the pilot radar draws pinned to the rim because it lies beyond radar reach. */
    beyondRadarRange?: boolean;
};

/**
 * Describe a visible object for a station holding `faction` (undefined = game master, full scan).
 * Callers must have established visibility first — this degrades detail, it does not hide contacts.
 */
export function describeContact(
    object: SpaceObject,
    faction: number | undefined,
    observer: { x: number; y: number },
): Contact {
    const scanLevel = playerScanLevel(object, faction);
    const identified = scanLevel >= ScanLevel.BASIC;
    const diff = XY.difference(object.position, observer);
    const contact: Contact = {
        id: object.id,
        name: objectDisplayName(object, object.id, scanLevel),
        scanLevel: ScanLevel[scanLevel] as keyof typeof ScanLevel,
        position: { x: object.position.x, y: object.position.y },
        distance: XY.lengthOf(diff),
        bearing: XY.angleOf(diff),
        radius: object.radius,
    };
    if (identified) {
        contact.type = object.type;
        contact.faction = object.faction;
        if (Spaceship.isInstance(object)) {
            contact.heading = object.angle;
        }
    }
    return contact;
}
