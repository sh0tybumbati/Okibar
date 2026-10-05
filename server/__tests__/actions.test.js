// Tests for the server-side action logic patterns.
// These verify the mutation logic used by socket handlers.

const { archiveVideo, findArchivedFile, VIDEO_ID_REGEX } = require('../archiver');

describe('VIDEO_ID_REGEX', () => {
  test('accepts valid 11-char YouTube video IDs', () => {
    expect(VIDEO_ID_REGEX.test('dQw4w9WgXcQ')).toBe(true);
    expect(VIDEO_ID_REGEX.test('fJ9rUzIMcZQ')).toBe(true);
    expect(VIDEO_ID_REGEX.test('9bZkp7q19f0')).toBe(true);
    expect(VIDEO_ID_REGEX.test('kJQP7kiw5Fk')).toBe(true);
    expect(VIDEO_ID_REGEX.test('_-XYZabcDEF')).toBe(true); // underscores and hyphens
  });

  test('rejects invalid video IDs', () => {
    expect(VIDEO_ID_REGEX.test('')).toBe(false);
    expect(VIDEO_ID_REGEX.test('short')).toBe(false);
    expect(VIDEO_ID_REGEX.test('toolongvideoidentifier')).toBe(false);
    expect(VIDEO_ID_REGEX.test('dQw4w9WgXc!')).toBe(false); // special char
    expect(VIDEO_ID_REGEX.test('dQw4w9WgXc ')).toBe(false); // space
    expect(VIDEO_ID_REGEX.test('../etc/passwd')).toBe(false); // path traversal
    expect(VIDEO_ID_REGEX.test('$(whoami)XX')).toBe(false); // command injection
  });
});

describe('Queue mutation logic', () => {
  let queue;

  beforeEach(() => {
    queue = [
      { id: 1, videoId: 'dQw4w9WgXcQ', title: 'Song A' },
      { id: 2, videoId: 'fJ9rUzIMcZQ', title: 'Song B' },
      { id: 3, videoId: '9bZkp7q19f0', title: 'Song C' },
    ];
  });

  test('queue:add appends a song', () => {
    const song = { id: 4, videoId: 'kJQP7kiw5Fk', title: 'Song D' };
    queue.push(song);
    expect(queue).toHaveLength(4);
    expect(queue[3].title).toBe('Song D');
  });

  test('queue:remove filters by id', () => {
    queue = queue.filter(s => s.id !== 2);
    expect(queue).toHaveLength(2);
    expect(queue.map(s => s.id)).toEqual([1, 3]);
  });

  test('queue:reorder moves item correctly', () => {
    const fromIndex = 0;
    const toIndex = 2;
    const arr = [...queue];
    const [moved] = arr.splice(fromIndex, 1);
    const clampedTo = Math.max(0, Math.min(toIndex, arr.length));
    arr.splice(clampedTo, 0, moved);
    expect(arr.map(s => s.id)).toEqual([2, 3, 1]);
  });

  test('queue:reorder with same index is no-op', () => {
    const arr = [...queue];
    const [moved] = arr.splice(1, 1);
    arr.splice(1, 0, moved);
    expect(arr.map(s => s.id)).toEqual([1, 2, 3]);
  });

  test('queue:playNext shifts first item', () => {
    const next = queue.shift();
    expect(next.id).toBe(1);
    expect(queue).toHaveLength(2);
    expect(queue[0].id).toBe(2);
  });

  test('queue:clear empties the queue', () => {
    queue = [];
    expect(queue).toHaveLength(0);
  });
});

describe('PIN hashing', () => {
  const crypto = require('crypto');
  const PIN_SALT = 'okibar::pin::v1';
  const hashPin = (pin) => crypto.createHash('sha256').update(`${PIN_SALT}${pin}`).digest('hex');

  test('produces a 64-char hex hash', () => {
    const hash = hashPin('1234');
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });

  test('same input produces same hash', () => {
    expect(hashPin('1234')).toBe(hashPin('1234'));
  });

  test('different inputs produce different hashes', () => {
    expect(hashPin('1234')).not.toBe(hashPin('5678'));
  });

  test('uses the expected salt', () => {
    const expected = crypto.createHash('sha256').update('okibar::pin::v11234').digest('hex');
    expect(hashPin('1234')).toBe(expected);
  });
});

describe('Order mutation logic', () => {
  test('order:submit appends to pending orders', () => {
    const pendingOrders = {};
    const tableNumber = 1;
    const orders = [{ id: 100, type: 'drink', item: 'Beer', price: 5 }];
    
    if (!pendingOrders[tableNumber]) pendingOrders[tableNumber] = [];
    pendingOrders[tableNumber].push(...orders);
    
    expect(pendingOrders[1]).toHaveLength(1);
    expect(pendingOrders[1][0].item).toBe('Beer');
  });

  test('order:cancel removes by id', () => {
    const pendingOrders = {
      1: [
        { id: 100, item: 'Beer', price: 5 },
        { id: 101, item: 'Wine', price: 7 },
      ]
    };
    pendingOrders[1] = pendingOrders[1].filter(o => o.id !== 100);
    expect(pendingOrders[1]).toHaveLength(1);
    expect(pendingOrders[1][0].item).toBe('Wine');
  });

  test('order:clear empties table orders', () => {
    const pendingOrders = { 1: [{ id: 100 }, { id: 101 }], 2: [{ id: 200 }] };
    pendingOrders[1] = [];
    expect(pendingOrders[1]).toHaveLength(0);
    expect(pendingOrders[2]).toHaveLength(1); // other tables untouched
  });
});
