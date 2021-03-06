import { expect } from 'chai';
import { spy } from 'sinon';
import { observers, unresolved } from '../../symbols';
import { Atom } from '../atom';
import { Factory } from '../base-derivable.spec';
import { atom } from '../factories';
import { isDerivableAtom, isSettableDerivable } from '../typeguards';

export function testFallbackTo(factory: Factory) {
    describe('#fallbackTo', () => {
        it('fallback to the result of the provided function', () => {
            const a$ = factory<string>(unresolved);
            const fallback = spy(() => 42);
            const b$ = a$.fallbackTo(fallback);

            expect(b$.get()).to.equal(42);
            expect(fallback).to.have.been.calledOnce;

            if (isSettableDerivable(a$)) {
                a$.set('a value');
                expect(b$.get()).to.equal('a value');
                expect(fallback).to.have.been.calledOnce;

                if (isDerivableAtom(a$)) {
                    a$.unset();
                    expect(b$.get()).to.equal(42);
                    expect(fallback).to.have.been.calledTwice;
                }
            }
        });

        it('fallback to the value of the provided derivable', () => {
            const a$ = factory<string>(unresolved);
            const fallback$ = atom(42);
            spy(fallback$, 'get');
            const b$ = a$.fallbackTo(fallback$);

            expect(b$.get()).to.equal(42);
            expect(fallback$.get).to.have.been.calledOnce;

            if (isSettableDerivable(a$)) {
                a$.set('a value');
                expect(b$.get()).to.equal('a value');
                expect(fallback$.get).to.have.been.calledOnce;

                if (isDerivableAtom(a$)) {
                    a$.unset();
                    expect(b$.get()).to.equal(42);
                    expect(fallback$.get).to.have.been.calledTwice;
                }
            }
        });

        it('should not connect to the fallback when not needed', () => {
            const a$ = factory<string>(unresolved);
            const fallback$ = new Atom(42);
            const b$ = a$.fallbackTo(fallback$);

            expect(fallback$[observers]).to.be.empty;
            expect(b$.autoCache().get()).to.equal(42);
            expect(fallback$[observers]).to.have.length(1);

            if (isSettableDerivable(a$)) {
                a$.set('a value');
                b$.get();
                expect(fallback$[observers]).to.be.empty;

                if (isDerivableAtom(a$)) {
                    a$.unset();
                    b$.get();
                    expect(fallback$[observers]).to.have.length(1);
                }
            }
        });

        it('fallback to the provided value', () => {
            const a$ = factory<string>(unresolved);
            const b$ = a$.fallbackTo(42);

            expect(b$.get()).to.equal(42);

            if (isSettableDerivable(a$)) {
                a$.set('a value');
                expect(b$.get()).to.equal('a value');

                if (isDerivableAtom(a$)) {
                    a$.unset();
                    expect(b$.get()).to.equal(42);
                }
            }
        });
    });
}
