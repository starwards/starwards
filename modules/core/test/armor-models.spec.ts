import { compositeArmor, faradayArmor, hardenedArmor, reactiveArmor, whippleArmor, withFaradayLayer } from '../src';

import { expect } from 'chai';

describe('armor model presets (issue #1929)', () => {
    it('Composite takes normal damage from all physical types, doubled from Tandem', () => {
        expect(compositeArmor.plateDamage_HiExp).to.equal(1);
        expect(compositeArmor.plateDamage_ArmPen).to.equal(1);
        expect(compositeArmor.plateDamage_Frag).to.equal(1);
        expect(compositeArmor.plateDamage_Tandem).to.equal(2);
    });

    it('Whipple blocks blast types but is vulnerable to penetrators', () => {
        expect(whippleArmor.plateDamage_HiExp).to.equal(0);
        expect(whippleArmor.plateDamage_Frag).to.equal(0);
        expect(whippleArmor.plateDamage_ArmPen).to.equal(2);
        expect(whippleArmor.plateDamage_Tandem).to.equal(2);
    });

    it('Hardened grinds down slowly under blast and takes Tandem better than Whipple', () => {
        expect(hardenedArmor.plateDamage_HiExp).to.equal(0.5);
        expect(hardenedArmor.plateDamage_ArmPen).to.equal(2);
        expect(hardenedArmor.plateDamage_Tandem).to.equal(1);
    });

    it('Reactive has single-use cells and is fully penetrated by Tandem', () => {
        expect(reactiveArmor.singleUsePlates).to.equal(true);
        expect(reactiveArmor.plateDamage_Tandem).to.be.greaterThan(0);
        expect(reactiveArmor.penetration_Tandem).to.equal(1);
        expect(reactiveArmor.plateDamage_ArmPen).to.equal(0);
    });

    it('only Reactive deflects the surface-effect scrape', () => {
        expect(reactiveArmor.deflectsSurfaceEffect).to.equal(true);
        for (const model of [compositeArmor, whippleArmor, hardenedArmor, faradayArmor]) {
            expect(model.deflectsSurfaceEffect).to.equal(false);
        }
    });

    it('every non-Faraday model lets Elec hits bypass the plates', () => {
        for (const model of [compositeArmor, whippleArmor, hardenedArmor, reactiveArmor]) {
            expect(model.plateDamage_Elec).to.equal(0);
            expect(model.penetration_Elec).to.equal(1);
        }
    });

    it('pure Faraday blocks Elec but lets physical types through — except Frag, which never penetrates', () => {
        expect(faradayArmor.penetration_Elec).to.equal(0);
        expect(faradayArmor.plateDamage_Elec).to.equal(0);
        for (const key of ['HiExp', 'ArmPen', 'Tandem'] as const) {
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
