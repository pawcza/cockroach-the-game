/**
 * What the bosses shout at the roach while it runs. Plain data, one pool per boss and occasion, easy to edit: add a
 * line to a list and it is in. Keep each line to 45 characters so it fits the little speech panel and can be read at
 * a run. No real people, no brands.
 *
 * approach   the boss is getting near (said at about 60% and 90% of the way to it)
 * comboLost  the player dropped a combo
 * closeCall  the player just scraped past an obstacle ("NA STYK!")
 * streak     a long clean run of pickups
 * gameOver   the player died before reaching this boss
 */
import type { BossId } from './bosses';

export type TauntCategory = 'approach' | 'comboLost' | 'closeCall' | 'streak' | 'gameOver';

/** What each boss shouts as its name lands on the versus splash. */
export const BOSS_SHOUTS: Record<BossId, string> = {
  lodzia: 'Lodzia!',
  bigos: 'Bigos!',
  zlewiatan: 'Zlewiatan!',
  eksterminator: 'Eksterminator!',
};

/** The most characters a line may have: longer ones do not fit the panel in two lines. */
export const TAUNT_MAX_CHARS = 45;

export const TAUNT_LINES: Record<BossId, Record<TauntCategory, readonly string[]>> = {
  // A nosy neighbour from the block of flats, slipper in hand
  lodzia: {
    approach: [
      'Ja tu na ciebie czekam z kapciem!',
      'Dawno nie było tak brudno na klatce!',
      'Zaraz zrobię z ciebie dywanik!',
      'Ja przez judasza wszystko widzę!',
      'Po cichu to ja lubię, a ty tupiesz!',
      'Wycieraczkę mi zbrukasz, szkodniku!',
      'Nie tędy, nie tędy, to moja klatka!',
      'Idzie, idzie... a ja już mam kapeć.',
      'Na zebraniu wspólnoty o tobie mówili!',
      'Raz, a dobrze, tak zawsze mówię!',
    ],
    comboLost: [
      'A nie mówiłam? Raz, a dobrze!',
      'Ojojoj, rozsypałeś! Kto to posprząta?',
      'Jabłka się nie marnuje, ty łapserdaku!',
      'Tak to wygląda ta dzisiejsza młodzież!',
      'Mój Zbyszek by tego nie zmarnował!',
      'Po co ci to było, po co?',
      'Zmarnowane! Mama by się złapała za głowę.',
      'Zgubiłeś, to teraz szukaj na kolanach!',
    ],
    closeCall: [
      'Ojej! Serce mi stanęło, nie rób tak!',
      'Na styk, jak ceny w sklepie na rogu!',
      'Jeszcze trochę i byłby kapeć!',
      'Ale ty się pchasz pod koła, gołąbku!',
      'O mało, a bym zawołała pogotowie!',
      'Tak nie wolno, ja mam ciśnienie!',
      'Jak się nie patrzy, to się obrywa!',
      'Ten to ma szczęście, jak w totka.',
    ],
    streak: [
      'No proszę, jaki zwinny, aż mi głupio.',
      'Nikt tak długo nie biegał po mojej klatce.',
      'Zmęczysz się, skarbie, odpocznij.',
      'Ładnie ci idzie, ale ja i tak wygram.',
      'Jak tak dalej pójdzie, zrobię ci herbatę.',
      'Oho, wzięło się do roboty!',
      'Sąsiadka z czwórki by tak nie umiała.',
      'Taki zwinny, a schodów nie umie umyć.',
    ],
    gameOver: [
      'Nawet do mnie nie dobiegłeś, ha!',
      'Żegnam, wróć jak będziesz dorosły.',
      'Ja kapeć w pogotowiu, a ty już po!',
      'Szkoda, miałam dla ciebie herbatę.',
      'Cisza nocna, kochasiu, idź spać.',
      'Raz, a dobrze... ale nie dziś, chłopcze.',
      'Nawet kapcia nie musiałam wyciągać.',
      'Przyjdź, jak podrośniesz, to pogadamy.',
    ],
  },

  // The MC of a village disco in the fire-station hall
  bigos: {
    approach: [
      'Parkiet czeka, ruszaj na remizę!',
      'Ręce w górę, dziś bigos dla wszystkich!',
      'Za chwilę bas, a po basie bigos!',
      'Remiza płonie, a ty tu jeszcze biegasz?',
      'Panie i panowie, wchodzi karaluch!',
      'Zapraszam na parkiet, zabawa do rana!',
      'Ej, ty! Wodzirej cię wzywa na środek!',
      'Bigos na ciepło, bas na maksa!',
      'Kto nie tańczy, ten nie ma bigosu!',
      'Sołtys już się bawi, tylko ciebie brak!',
    ],
    comboLost: [
      'Pomyliłeś krok, kolego, ale bis!',
      'Ojojoj, rytm ci uciekł jak kiełbasa!',
      'Zgubiłeś takt, wracaj na parkiet!',
      'Bas poszedł, a ty zostałeś w tyle!',
      'Fałsz! Konkurs tańca nie dla ciebie!',
      'Muzyka gra, a ty tupiesz nie w ten rytm!',
      'Co to było, krok czy potknięcie?',
      'Jury daje zero, ale bigos dostaniesz.',
    ],
    closeCall: [
      'Uuu! Prawie wylądowałeś w kiełbasie!',
      'Na styk! Jak w kolejce po bigos!',
      'Ale slajd! Dyskoteka bije brawo!',
      'Ho ho! Taniec na krawędzi remizy!',
      'Ledwo, ledwo, jak ostatni autobus.',
      'Dobry unik! Wodzirej pod wrażeniem!',
      'Wow, z bitem ci to wyszło!',
      'Prawie bum! A jednak tańczysz dalej!',
    ],
    streak: [
      'Parkiet płonie! Dalej, dalej, dalej!',
      'Ludzie, patrzcie, jaki on dziś w formie!',
      'Tak się tańczy na wiejskiej dyskotece!',
      'Brawa dla karalucha, drodzy państwo!',
      'Ale ci idzie, aż basy drżą!',
      'Król parkietu? Nie, to ja nim jestem.',
      'Taniec zwycięzców, kto go przerwie?',
      'DJ widzi wszystko, a ty dziś błyszczysz!',
    ],
    gameOver: [
      'Koniec zabawy, parkiet zamknięty!',
      'Nawet do remizy nie dobiegłeś, ha!',
      'Bigos wystygł, a ty padłeś, kolego!',
      'Za wcześnie, za wcześnie, bez bisów!',
      'Wróć na parkiet, jak się wyśpisz!',
      'Bas ucichł, wodzirej nad tobą płacze.',
      'Dyskoteka bez ciebie, ale gramy dalej!',
      'Taniec skończył się przed bigosem!',
    ],
  },

  // Three heads that finish each other's lines: the grumpy tower block, the dramatic pieróg, the deadpan carp
  zlewiatan: {
    approach: [
      'Znowu hałas. — Ach, gość! — Karaluch.',
      'Remont! — Tragedia! — Nie, to robal.',
      'Czemu tak głośno? — Ratunku! — Cisza.',
      'Spadaj. — Wejdź, kochany! — Nie wchodź.',
      'Windy nie ma. — Łzy! — Schody też nie.',
      'Kto tam? — Mój wybawca! — Robal.',
      'Blok się trzęsie. — Dramat! — To on.',
      'Czynsz rośnie. — Och! — Karaluch też.',
    ],
    comboLost: [
      'Zgubił. — Och, co za strata! — Typowe.',
      'Znowu nie tak. — Szlochaj! — Wiadomo.',
      'Rozsypał. — Tragedia w trzech aktach! — Nuda.',
      'Kombo poszło. — Żegnaj, piękne! — No.',
      'Leży. — Legenda upadła! — Ryba nie płacze.',
      'Zmarnował. — Kto to widział! — Ja widziałem.',
      'Pech. — Ten smutek! — Statystyka.',
      'Hałas i nic. — Dramat! — Ani rybki.',
    ],
    closeCall: [
      'Ledwo. — Serce mi staje! — Nie drgnąłem.',
      'Uważaj! — Och, prawie! — Nie szkoda.',
      'Za blisko. — Krzyk! — To tylko śmierć.',
      'Mało brakowało. — Ach, mamo! — Szkoda.',
      'Fuszerka. — Dreszcze! — Jeszcze raz.',
      'Omal! — Łaaa! — ...Nic.',
      'Prawie zgniótł. — Dramat! — Żyje. Nuda.',
      'O włos. — Zemdlałem! — Nie zemdlałeś.',
    ],
    streak: [
      'Za dobry. — Brawo, och! — Podejrzane.',
      'Jeszcze nie padł. — Cud! — Pomóżmy mu.',
      'Biega i biega. — Podziwiam! — Męczy mnie.',
      'Dość tego. — Świetnie mu idzie! — Przestań.',
      'Za cicho. — Pięknie tańczy! — Zleci.',
      'Nie lubię. — Uwielbiam! — Zobaczymy.',
      'Nie sapie. — Wspaniale! — Przejdzie mu.',
      'Za szybko. — Co za talent! — Mnie zlewa.',
    ],
    gameOver: [
      'Padł. — Och, tak młodo! — Typowe.',
      'Nie dobiegł. — Płaczę! — Dobrze.',
      'Za wcześnie. — Żegnaj! — Zlew nie czekał.',
      'Do zlewu go. — Na pogrzeb! — Cicho.',
      'Szkoda. — Wielka szkoda! — Nie aż tak.',
      'Znowu nic. — Pustka! — Ryba wiedziała.',
      'Mój blok. — Mój zlew! — Wróć jutro.',
      'I po biegu. — Wzruszenie! — Dziękuję, nie.',
    ],
  },

  // A tradesman on the job: quotes, invoices, call-out charges
  eksterminator: {
    approach: [
      'Wycena gratis, egzekucja płatna.',
      'Nadjeżdżam. Dojazd liczony osobno.',
      'Zaraz zrobimy tu porządek, bez faktury.',
      'Gwarancja? Na ciebie tylko do piątku.',
      'Robal w domu, a telefon do mnie.',
      'Trujemy fachowo, kolega polecał.',
      'Idę po ciebie, termin pilny.',
      'Dzień dobry, w sprawie pana lokatorów.',
    ],
    comboLost: [
      'Strata. Na fakturze tego nie odliczę.',
      'Nie wyszło? Dopłata za poprawkę.',
      'Chaos. Ja bym to zrobił równo.',
      'Kombo? Nie widzę w kosztorysie.',
      'Fuszerka. Bez gwarancji.',
      'Zgubiłeś. Odliczę od honorarium.',
      'Za wolno. Rynek nie czeka.',
      'Robota na odwal, panie karaluchu.',
    ],
    closeCall: [
      'O włos. Ale zapłacisz za nerwy.',
      'Cena za ryzyko wzrosła o połowę.',
      'Prawie. Dopłata za emocje.',
      'Na styk. Jak moje terminy.',
      'Blisko! Doliczam do rachunku.',
      'Uf! Prawie straciłem zlecenie.',
      'Fachowy unik, szkoda że bez faktury.',
      'Prawie, prawie. Wolę dokończyć sam.',
    ],
    streak: [
      'Dobrze ci idzie. Podniosę stawkę.',
      'Fachowiec z ciebie. Szkoda, że robal.',
      'Za dobrze. Szukam droższej trutki.',
      'Rynek się zmienia, a ty nie padasz.',
      'Cały czas na chodzie? Podejrzane.',
      'Brawo. Rachunek za podziw: sto zeta.',
      'Ładnie. Ale ja mam więcej cierpliwości.',
      'Uciekaj. I tak cię wycenię.',
    ],
    gameOver: [
      'Zlecenie wykonane. Bez faktury.',
      'Cena zero, robota skończona.',
      'Klient zadowolony. Karaluch mniej.',
      'Nie dobiegłeś. Rachunek wystawię za nic.',
      'Brak gwarancji, brak karalucha.',
      'Jedna robota mniej na liście.',
      'Dzięki za współpracę. Nie wracaj.',
      'Szkoda, miałem dla ciebie kosztorys.',
    ],
  },
};
