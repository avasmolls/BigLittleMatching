const normalize = text => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Keep a big and her littles together so search never hides match context.
export function filterResults({ people, pairs, query, filter }) {
  const search = normalize(query.trim());
  const nameMatches = name => normalize(name).includes(search);
  const visibleBigs = Object.keys(people.bigs).filter(big => {
    const matches = pairs.filter(pair => pair.big === big);
    if (!matches.length) return false;
    const categoryMatches = filter === "all"
      || (filter === "twins" && matches.length === 2)
      || (filter === "locked" && matches.some(pair => pair.locked));
    return categoryMatches && (nameMatches(people.bigs[big].name)
      || matches.some(pair => nameMatches(people.littles[pair.little].name)));
  });
  const showUnmatched = filter === "all" || filter === "unmatched";
  const visibleUnBigs = showUnmatched ? Object.keys(people.bigs)
    .filter(big => !pairs.some(pair => pair.big === big) && nameMatches(people.bigs[big].name)) : [];
  const visibleUnLittles = showUnmatched ? Object.keys(people.littles)
    .filter(little => !pairs.some(pair => pair.little === little) && nameMatches(people.littles[little].name)) : [];
  return { visibleBigs, visibleUnBigs, visibleUnLittles };
}
