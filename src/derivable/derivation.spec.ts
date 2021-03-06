import { expect } from 'chai';
import { SinonFakeTimers, SinonSpy, spy, useFakeTimers } from 'sinon';
import { Derivable, SettableDerivable } from '../interfaces';
import { config, ErrorWrapper } from '../utils';
import { Atom } from './atom';
import { testDerivable } from './base-derivable.spec';
import { Constant } from './constant';
import { Derivation } from './derivation';
import { atom, derive } from './factories';

describe('derivable/derive', () => {
    context('(standalone)', () => {
        testDerivable(v => derive(() => { if (v instanceof ErrorWrapper) { throw v.error; } return v; }));
    });

    context('(based on atom)', () => {
        testDerivable(v => new Atom(v).derive(d => d));
    });

    context('(based on constant)', () => {
        testDerivable(v => new Constant(v).derive(d => d));
    });

    testAutocache((a$, deriver) => a$.derive(deriver));

    it('should not generate a stacktrace on instantiation', () => {
        expect(derive(() => 0).creationStack).to.be.undefined;
    });

    context('in debug mode', () => {
        before('setDebugMode', () => { config.debugMode = true; });
        after('resetDebugMode', () => { config.debugMode = false; });

        it('should augment an error when it is caught in the deriver function', () => {
            const d$ = derive(() => { throw new Error('the Error'); });
            expect(() => d$.get()).to.throw('the Error');
            try {
                d$.get();
            } catch (e) {
                expect(e.stack).to.contain('the Error');
                expect(e.stack).to.contain(d$.creationStack!);
            }
        });
    });

    it('should not call the deriver when the cached value is known to be up to date because of a reactor', () => {
        const deriver = spy(() => 123);
        const d$ = derive(deriver);
        d$.get();
        expect(deriver).to.have.been.calledOnce;
        d$.react(() => 0);
        expect(deriver).to.have.been.calledTwice;
        d$.get();
        expect(deriver).to.have.been.calledTwice;
    });

    it('should cache thrown errors to rethrow them on multiple accesses until the derivation produces a new result', () => {
        const a$ = atom(false);
        const theError = new Error('the error');
        const deriver = spy((a: boolean) => { if (a) { throw theError; } else { return 'a value'; } });
        const d$ = a$.derive(deriver).autoCache();
        expect(d$.get(), 'first time').to.equal('a value');
        expect(d$.get(), 'second time').to.equal('a value');
        expect(deriver).to.have.been.calledOnce;
        a$.set(true);
        expect(() => d$.get(), 'first time').to.throw(theError);
        expect(() => d$.get(), 'second time').to.throw(theError);
        expect(deriver).to.have.been.calledTwice;
        a$.set(false);
        expect(d$.get(), 'first time').to.equal('a value');
        expect(d$.get(), 'second time').to.equal('a value');
        expect(deriver).to.have.been.calledThrice;
    });

    it('should allow error objects as valid values', () => {
        const theError = new Error('the error');
        const deriver = spy(() => theError);
        const d$ = derive(deriver).autoCache();
        expect(d$.get(), 'first time').to.equal(theError);
        expect(d$.get(), 'second time').to.equal(theError);
        expect(deriver).to.have.been.calledOnce;
    });

    it('should use the Derivation object as `this`', () => {
        const derivation$ = new Derivation(function () { expect(this).to.equal(derivation$); return 1; });
        expect(derivation$.get()).to.equal(1);
    });
});

export function testAutocache(factory: (a$: Derivable<string>, deriver: (v: string) => string) => Derivable<string>) {

    describe('#autoCache', () => {
        let clock: SinonFakeTimers;
        beforeEach('use fake timers', () => { clock = useFakeTimers(); });
        afterEach('restore timers', () => { clock.restore(); });

        let a$: SettableDerivable<string>;
        beforeEach('create the atom', () => { a$ = atom('value'); });

        let deriver: SinonSpy;
        beforeEach('create the deriver', () => { deriver = spy((v = 'empty') => v + '!'); });

        let d$: Derivable<string>;
        beforeEach('create the derivation', () => { d$ = factory(a$, deriver).autoCache(); });

        it('should automatically cache the value of the Derivable the first time in a tick', () => {
            expect(d$.get()).to.equal('value!');
            expect(deriver).to.have.been.calledOnce;
            expect(d$.get()).to.equal('value!');
            expect(d$.get()).to.equal('value!');
            expect(deriver).to.have.been.calledOnce;
        });

        it('should stop the cache after the tick', () => {
            expect(d$.get()).to.equal('value!');
            expect(deriver).to.have.been.calledOnce;

            clock.tick(0);

            expect(deriver).to.have.been.calledOnce;
            expect(d$.get()).to.equal('value!');
            expect(deriver).to.have.been.calledTwice;

            expect(d$.get()).to.equal('value!');
            expect(deriver).to.have.been.calledTwice;
        });

        it('should keep the value updated', () => {
            expect(d$.get()).to.equal('value!');
            expect(deriver).to.have.been.calledOnce;

            a$.set('another value');
            expect(deriver).to.have.been.calledOnce;
            expect(d$.get()).to.equal('another value!');
            expect(deriver).to.have.been.calledTwice;
            expect(d$.get()).to.equal('another value!');
            expect(deriver).to.have.been.calledTwice;
        });

        it('should start a reactor without recalculation', () => {
            expect(d$.get()).to.equal('value!');
            expect(deriver).to.have.been.calledOnce;

            const received: string[] = [];
            d$.react(received.push.bind(received));
            expect(received).to.deep.equal(['value!']);
            expect(deriver).to.have.been.calledOnce;

            a$.set('another value');
            expect(received).to.deep.equal(['value!', 'another value!']);
            expect(deriver).to.have.been.calledTwice;
        });

        it('should not interfere with reactor observation after a tick', () => {
            expect(d$.get()).to.equal('value!');

            const received: string[] = [];
            d$.react(received.push.bind(received));
            expect(received).to.deep.equal(['value!']);

            clock.tick(0);

            a$.set('another value');
            expect(received).to.deep.equal(['value!', 'another value!']);
        });

        it('should cache derivables until the next tick even when all existing observers disappear', () => {
            const stopReactor = d$.react(() => void 0);
            expect(deriver).to.have.been.calledOnce;

            // Value is already cached, so autoCacheMode has no effect now.
            expect(d$.get()).to.equal('value!');
            expect(deriver).to.have.been.calledOnce;

            stopReactor();

            // Value should still be cached even when all reactors are stopped.
            expect(d$.get()).to.equal('value!');
            expect(deriver).to.have.been.calledOnce;

            clock.tick(0);

            // Only after the tick, the cache may be released.
            expect(d$.get()).to.equal('value!');
            expect(deriver).to.have.been.calledTwice;
        });
    });
}
