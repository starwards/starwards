import {
    ArmorLayerDesignState,
    compositeArmor,
    faradayArmor,
    hardenedArmor,
    weaponDamageTypes,
    whippleArmor,
    withFaradayLayer,
} from '../src';

import { expect } from 'chai';

const allModels = { compositeArmor, whippleArmor, hardenedArmor, faradayArmor } as const;

describe('armor model stats validity', () => {
    it('every armor model defines plateDamage and penetration for every damage type', () => {
        for (const [name, model] of Object.entries(allModels)) {
            for (const t of weaponDamageTypes) {
                expect(model[`plateDamage_${t}`], `${name}.plateDamage_${t}`).to.be.a('number');
                expect(model[`penetration_${t}`], `${name}.penetration_${t}`).to.be.a('number');
            }
        }
    });

    it('ArmorLayerDesignState carries a synced field for every damage type', () => {
        const design = new ArmorLayerDesignState();
        for (const t of weaponDamageTypes) {
            expect(design.plateDamage(t), `plateDamage_${t}`).to.be.a('number');
            expect(design.penetration(t), `penetration_${t}`).to.be.a('number');
        }
    });

    it('penetration is within [0,1], and binary when the armor does not engage the type', () => {
        for (const [name, model] of Object.entries(allModels)) {
            for (const t of weaponDamageTypes) {
                const penetration = model[`penetration_${t}`];
                expect(penetration, `${name}.penetration_${t}`).to.be.within(0, 1);
                if (model[`plateDamage_${t}`] === 0) {
                    // the blocked path treats penetration as all-or-nothing (see DamageManager)
                    expect([0, 1], `${name}.penetration_${t} must be 0 or 1 when plateDamage_${t} is 0`).to.include(
                        penetration,
                    );
                }
            }
        }
    });
});

describe('armor model presets (issue #1929)', () => {
    it('Composite is the baseline, weak to penetrators', () => {
        expect(compositeArmor.plateDamage_HiExp).to.equal(1);
        expect(compositeArmor.plateDamage_ArmPen).to.equal(2);
        expect(compositeArmor.penetration_ArmPen).to.equal(0);
    });

    it('Frag never interacts with any armor — 0/0 across all models', () => {
        for (const model of [compositeArmor, whippleArmor, hardenedArmor, faradayArmor]) {
            expect(model.plateDamage_Frag).to.equal(0);
            expect(model.penetration_Frag).to.equal(0);
        }
    });

    it('Whipple blunts blast; kinetic penetrators punch straight through', () => {
        expect(whippleArmor.plateDamage_HiExp).to.equal(0.25);
        expect(whippleArmor.plateDamage_Frag).to.equal(0);
        expect(whippleArmor.plateDamage_ArmPen).to.equal(0);
        expect(whippleArmor.penetration_ArmPen).to.equal(1);
    });

    it('Hardened stops kinetic penetrators', () => {
        expect(hardenedArmor.plateDamage_HiExp).to.equal(0.5);
        expect(hardenedArmor.plateDamage_ArmPen).to.equal(1);
        expect(hardenedArmor.penetration_ArmPen).to.equal(0);
    });

    it('every non-Faraday passive model lets Elec hits bypass the plates', () => {
        for (const model of [compositeArmor, whippleArmor, hardenedArmor]) {
            expect(model.plateDamage_Elec).to.equal(0);
            expect(model.penetration_Elec).to.equal(1);
        }
    });

    it('pure Faraday blocks Elec but lets physical types through — except Frag, which never penetrates', () => {
        expect(faradayArmor.penetration_Elec).to.equal(0);
        expect(faradayArmor.plateDamage_Elec).to.equal(0);
        for (const key of ['HiExp', 'ArmPen'] as const) {
            expect(faradayArmor[`plateDamage_${key}`]).to.equal(0);
            expect(faradayArmor[`penetration_${key}`]).to.equal(1);
        }
        expect(faradayArmor.plateDamage_Frag).to.equal(0);
        expect(faradayArmor.penetration_Frag).to.equal(0);
    });

    it('withFaradayLayer blocks Elec without changing physical stats', () => {
        const layered = withFaradayLayer(whippleArmor);
        expect(layered.penetration_Elec).to.equal(0);
        expect(layered.plateDamage_Elec).to.equal(0);
        expect(layered.plateDamage_ArmPen).to.equal(whippleArmor.plateDamage_ArmPen);
        expect(layered.penetration_HiExp).to.equal(whippleArmor.penetration_HiExp);
    });
});
