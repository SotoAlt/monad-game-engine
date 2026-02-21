/**
 * Quick test script for game server API
 *
 * Run: node src/server/test.js
 * (Make sure server is running first: npm run world)
 */

const BASE_URL = 'http://localhost:3000';

async function test(name, fn) {
  try {
    const result = await fn();
    console.log(`✅ ${name}`);
    return result;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    return null;
  }
}

async function request(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function runTests() {
  console.log('\n🧪 Testing Game Server API\n');
  console.log('─'.repeat(50));

  // Test 1: Health check
  await test('Health check', async () => {
    const data = await request('/api/health');
    if (data.status !== 'ok') throw new Error('Bad status');
  });

  // Test 2: Get initial world state
  await test('Get world state (empty)', async () => {
    const data = await request('/api/world/state');
    if (!data.physics) throw new Error('Missing physics');
    if (!Array.isArray(data.entities)) throw new Error('Missing entities');
  });

  // Test 3: Spawn platform
  const platform = await test('Spawn platform', async () => {
    const data = await request('/api/world/spawn', 'POST', {
      type: 'platform',
      position: [0, 5, 0],
      size: [10, 1, 10],
      properties: { color: '#3498db' }
    });
    if (!data.id) throw new Error('Missing entity ID');
    return data;
  });

  // Test 4: Verify entity in state
  await test('Entity appears in state', async () => {
    const data = await request('/api/world/state');
    if (data.entities.length === 0) throw new Error('No entities');
  });

  // Test 5: Modify entity
  if (platform) {
    await test('Modify entity', async () => {
      await request('/api/world/modify', 'POST', {
        id: platform.id,
        changes: { size: [15, 1, 15] }
      });
    });
  }

  // Test 6: Set physics
  await test('Set physics', async () => {
    const data = await request('/api/physics/set', 'POST', {
      gravity: -4.9
    });
    if (data.physics.gravity !== -4.9) throw new Error('Gravity not updated');
  });

  // Test 7: Create challenge
  const challenge = await test('Create challenge', async () => {
    const data = await request('/api/challenge/create', 'POST', {
      type: 'reach',
      target: platform?.id,
      description: 'Reach the floating platform'
    });
    if (!data.id) throw new Error('Missing challenge ID');
    return data;
  });

  // Test 8: Get challenge status
  await test('Get challenge status', async () => {
    const data = await request('/api/challenge/status');
    if (!Array.isArray(data.challenges)) throw new Error('Missing challenges array');
  });

  // Test 9: Spawn collectible
  await test('Spawn collectible', async () => {
    await request('/api/world/spawn', 'POST', {
      type: 'collectible',
      position: [5, 6, 0],
      properties: { points: 100 }
    });
  });

  // Test 10: Invalid spawn (should fail gracefully)
  await test('Invalid spawn returns error', async () => {
    try {
      await request('/api/world/spawn', 'POST', {
        type: 'invalid_type',
        position: [0, 0, 0]
      });
      throw new Error('Should have failed');
    } catch (e) {
      if (!e.message.includes('Invalid')) throw e;
    }
  });

  // Test 11: Destroy entity
  if (platform) {
    await test('Destroy entity', async () => {
      await request('/api/world/destroy', 'POST', { id: platform.id });
    });
  }

  // Final state
  console.log('\n' + '─'.repeat(50));
  console.log('\n📊 Final World State:\n');
  const finalState = await request('/api/world/state');
  console.log(JSON.stringify(finalState, null, 2));

  console.log('\n✨ Tests complete!\n');
}

runTests().catch(console.error);
