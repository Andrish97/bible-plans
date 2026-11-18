// Wczytywanie plików danych (z pamięcią podręczną). Aplikacja działa z serwera (GitHub Pages);
// lokalnie uruchom np. `python3 -m http.server` w katalogu repozytorium.
import {Translation} from './bible.js';

const cache = new Map();
function getJson(path, optional = false){
  if(!cache.has(path)){
    cache.set(path, fetch(path).then(r => {
      if(r.ok) return r.json();
      if(optional && r.status === 404) return null;
      throw new Error(`Nie udało się wczytać ${path} (${r.status})`);
    }));
  }
  return cache.get(path);
}

export const loadCanon = () => getJson('data/books.json');
export const loadTranslationList = () => getJson('data/translations.json');
export const loadChronology = () => getJson('data/chronology.json');

const models = new Map();
/** Model przekładu (budowa + nagłówki) i chronologia dopasowana do jego wersyfikacji. */
export async function loadTranslation(info){
  if(!models.has(info.id)){
    models.set(info.id, (async () => {
      const [canon, structure, headings, chron, versification] = await Promise.all([
        loadCanon(),
        getJson(`data/translations/${info.id}/structure.json`),
        info.headings ? getJson(`data/translations/${info.id}/headings.json`, true) : null,
        loadChronology(),
        getJson(`data/translations/${info.id}/versification.json`, true),
      ]);
      const tr = new Translation(info, structure, headings, canon);
      tr.chronology = tr.mapChronology(chron, versification);
      return tr;
    })());
  }
  return models.get(info.id);
}
