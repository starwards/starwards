import { Decoder, Encoder } from '@colyseus/schema';
import { FlightDoctrine, TODAY_NPC_AI, aggroCharacters, makeShipState, npcDoctrines, shipConfigurations } from '../src';
import { expect } from 'chai';

describe('npc doctrines', () => {
    it('each doctrine is an NpcAiProfile named by its key, with a real flight doctrine and aggro character', () => {
        for (const [key, doctrine] of Object.entries(npcDoctrines)) {
            expect(doctrine.name).to.equal(key);
            expect(doctrine.flightDoctrine).not.to.equal(FlightDoctrine.AUTO);
            expect(doctrine.aggro).to.be.oneOf(Object.keys(aggroCharacters));
        }
    });

    it('the wave doctrines keep the values the archetypes always had', () => {
        const summary = Object.values(npcDoctrines).map(
            (d) => `${d.name} ${FlightDoctrine[d.flightDoctrine]} ${d.aggro}`,
        );
        expect(summary).to.deep.equal([
            'rush INTERCEPT Brawler',
            'holdRange STANDOFF Brawler',
            'shadowPlayer SHADOW Hunter',
            'shadowEscort SHADOW Brawler',
        ]);
    });

    it('doctrine is not synced: a client mirror never receives it', () => {
        const server = makeShipState('doctrine-ship', shipConfigurations['dragonfly-MK1']);
        server.aiProfile = npcDoctrines.shadowPlayer;
        const mirror = makeShipState('doctrine-mirror', shipConfigurations['dragonfly-MK1']);
        new Decoder(mirror).decode(new Encoder(server).encodeAll());
        expect(mirror.aiProfile).to.equal(TODAY_NPC_AI);
        expect(JSON.stringify(mirror.toJSON())).not.to.contain('shadowPlayer');
    });
});
