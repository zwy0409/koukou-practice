export function chooseEnglishVoice(voices,offline=false) {
  const english=voices.filter(v=>/^en(?:[-_]|$)/i.test(v.lang));
  const local=english.filter(v=>v.localService);
  const candidates=local.length?local:offline?[]:english;
  return candidates.find(v=>/^en[-_]US$/i.test(v.lang)) || candidates[0] || null;
}
