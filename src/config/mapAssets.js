const versions = typeof __HALFPIPE_MAP_VERSIONS__ === 'undefined'
  ? {} : __HALFPIPE_MAP_VERSIONS__;

function mapImage(file) {
  const version = versions[file];
  return '/images/maps/' + file + (version ? '?v=' + version : '');
}

export const MAP_IMAGES = Object.freeze({
  city: mapImage('city.jpg'),
  treeHouse: mapImage('treehouse.jpg'),
  cyberNight: mapImage('cyber-night.png'),
});
