import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpointContracts } from '../src/api/contracts/endpoints';
import { MockDataAdapter } from '../src/api/adapters/MockDataAdapter';
import { DEMO_PASSWORD } from '../src/api/mocks/fixtures';

for (const endpoint of endpointContracts) {
  test(`documented mock contract accepts ${endpoint.method} ${endpoint.path}`, async () => {
    const adapter = new MockDataAdapter(() => new Date('2026-11-11T08:00:00Z'), 0);
    const target = endpoint.path.startsWith('/places/') ? 'dalat-01' : endpoint.path.startsWith('/plans/') ? 'mock-pending' : endpoint.path.startsWith('/comments/') ? 'mock-comment' : endpoint.path.startsWith('/notifications/') ? 'mock-notice-mock-leader' : 'mock-dalat';
    const path = endpoint.path.replace(':id', target).replace(':placeId', 'dalat-01').replace('demo|live', 'demo');
    const token = endpoint.auth === 'public' ? null : endpoint.auth === 'author' ? 'mock:mock-member' : 'mock:mock-leader';
    let body = endpoint.requestExample;
    if (endpoint.path === '/auth/change-password') body = { currentPassword: DEMO_PASSWORD, newPassword: 'Changed123!' };
    const result = await adapter.request<unknown>(path, token, endpoint.method, body === null ? undefined : body);
    const shape = endpoint.responseExample;
    assert.equal(Array.isArray(result), Array.isArray(shape));
    assert.equal(typeof result, typeof shape);
    if (result && shape && !Array.isArray(shape)) for (const key of Object.keys(shape)) assert.ok(key in (result as object), `${endpoint.path}: missing ${key}`);
  });
}
test('contract inventory keeps existing endpoint names and marks only password integrations as proposed', () => {
  assert.equal(endpointContracts.length, 40);
  assert.deepEqual(endpointContracts.filter(e => e.status === 'proposed').map(e => e.path), ['/auth/forgot-password', '/auth/change-password']);
  assert.equal(new Set(endpointContracts.map(e => e.method + e.path)).size, 40);
});
