// items.js — Item definitions for LEVIATHAN
//
// EXTEND: add new items here. Use spawnItem(id, x, y) in MapBuilder to place them.
// Items can be offered to enemies during battle via the `give` command.
// Enemy reactions are defined in enemies.js under encounter.acceptedItems.

export const ITEMS = {

  bone: {
    id:          'bone',
    name:        'Bone',
    description: 'A fragment of something ancient. Still warm.',
  },

  echo_shard: {
    id:          'echo_shard',
    name:        'Echo Shard',
    description: 'Vibrates at a frequency just below hearing.',
  },

  black_salt: {
    id:          'black_salt',
    name:        'Black Salt',
    description: 'Used in rituals no one remembers anymore.',
  },

  void_dust: {
    id:          'void_dust',
    name:        'Void Dust',
    description: 'Smells like absence. Leaves no residue.',
  },

  warden_key: {
    id:          'warden_key',
    name:        'Warden\'s Key',
    description: 'Heavy. The teeth are worn smooth from use.',
  },

};
