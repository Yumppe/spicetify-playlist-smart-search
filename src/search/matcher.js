export function matchNode(track, node) {
  switch (node?.kind) {
    case 'true': return true;
    case 'invalid': return false;
    case 'not': return !matchNode(track, node.child);
    case 'and': return node.children.every((child) => matchNode(track, child));
    case 'or': return node.children.some((child) => matchNode(track, child));
    case 'text': return !node.value || track.searchText.includes(node.value);
    case 'field':
      if (!node.value) return true;
      if (node.field === 'artist') {
        return node.exact
          ? track.artistNorm.some((artist) => artist === node.value)
          : track.artistNorm.some((artist) => artist.includes(node.value));
      }
      return false;
    case 'year-eq': return track.year === node.a;
    case 'year-gt': return track.year !== null && track.year > node.a;
    case 'year-gte': return track.year !== null && track.year >= node.a;
    case 'year-lt': return track.year !== null && track.year < node.a;
    case 'year-lte': return track.year !== null && track.year <= node.a;
    case 'year-range': return track.year !== null && track.year >= node.a && track.year <= node.b;
    default: return false;
  }
}

export function filterTracks(tracks, parseResult) {
  if (!parseResult || parseResult.errors?.length) return [];
  return tracks.filter((track) => matchNode(track, parseResult.ast));
}
