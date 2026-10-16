import test from 'node:test';
import assert from 'node:assert/strict';
import { forgetFetch, shouldFetch } from './fetchOnce.js';

test('shouldFetch allows one fetch per ttl and can be reset', () => {
    assert.equal(shouldFetch('list', 1000, 10_000), true);
    assert.equal(shouldFetch('list', 1000, 10_500), false);
    assert.equal(shouldFetch('other', 1000, 10_500), true);
    assert.equal(shouldFetch('list', 1000, 11_001), true);
    forgetFetch('list');
    assert.equal(shouldFetch('list', 1000, 11_002), true);
});
