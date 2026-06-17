// kept/data.jsx — sample kept notes + date helpers.
// Voice matches `type`: sentence-case prose, lowercase chrome, no em dashes,
// no emoji. Each note is a freewritten page that was kept as a .md file.
// Exposed on window so later babel scripts can read it.

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function d(y, m, day) { return new Date(y, m - 1, day); }

// newest first — spinning the knob forward walks back in time
const RAW_NOTES = [
  [d(2026,5,21), `the trick the morning keeps from me\nis that it asks for nothing. i sit down certain there is a thing to solve and the light comes in flat across the desk and solves none of it. i write the sentence anyway. that is the whole practice. the sentence, then the next one, then the small surprise of having meant it.`],
  [d(2026,5,19), `what i want to remember about today:\nthat patience is a kind of attention, not the absence of it. waiting badly is just wanting with the volume up. waiting well is staying in the room.`],
  [d(2026,5,18), `a list of things that did not need fixing\nthe squeak in the third stair. the way she says "anyway" to end a call. the lamp that leans. i have been calling these problems. they are just the shape of the place i live.`],
  [d(2026,5,14), `note from the train\nfields, then a town, then fields. the country does not perform for the window. it simply is the thing it is while you pass, and is the same after you've gone. i would like to learn that.`],
  [d(2026,5,11), `on keeping a page\nyou cannot edit what rolls up the platen. at first this felt like loss. now it feels like honesty. the line said what it said at the hour it was said. i am allowed to have meant it then and mean something else now.`],
  [d(2026,5,7),  `she asked what i was afraid of\nand i gave the practiced answer, and then the train was loud, and in the loud part i thought of the real one and did not say it. writing it here instead: that i will get good at the wrong things.`],
  [d(2026,4,30), `april, last morning\nthe month leaves quietly. i did not finish the thing i meant to. i finished smaller things, every day, and the smaller things turn out to be the month. that is not a consolation. that is the arithmetic.`],
  [d(2026,4,27), `overheard, kept\n"i don't want it faster. i want it to feel like mine." a man to a barista about coffee, but i have been chewing on it for an hour as if it were about everything.`],
  [d(2026,4,22), `a small theory of desks\nthe desk is not for output. the desk is the one place i agree to be reachable by my own attention. nothing has to come of it. something usually does, but that is the desk's business, not mine.`],
  [d(2026,4,19), `rain all day\nand i resented it until i stopped, and the resenting was louder than the rain. the rain was just water keeping its appointments. i was the weather in the room.`],
  [d(2026,4,12), `for later\nthe idea is simple and i keep dressing it up so it will look like work. write it plain: make the thing that helps one person, the person being mostly me, and let that be enough to be true.`],
  [d(2026,4,5),  `the kind ones\nare not soft. they have simply decided, in advance and for good, which way they will lean when it costs them. i met one today. i would like to be a more decided person.`],
  [d(2026,3,29), `march is a long hallway\nyou enter it cold and leave it warmer and remember none of the doors. only that you walked, and that somewhere in it the light started staying longer in the evenings.`],
  [d(2026,3,24), `a sentence i underlined\n"scale is a moral instrument." i don't fully have it yet. something about how the size of a thing decides who it forgets. keeping it here until i do.`],
  [d(2026,3,20), `equinox\nequal day, equal night, and neither asked my permission. there is comfort in the indifferent clock of it. the planet will tilt back toward the light whether or not i deserve it.`],
  [d(2026,3,15), `note to the version of me at 11pm\nyou are not behind. you are tired, which feels identical and is not. close the lid. the work will be there, less frightening, in the flat morning light.`],
  [d(2026,3,9),  `things that are actually fast\nbread, if you wait. friendship, sometimes. forgetting a slight. things that are actually slow: trust, the good kind of sentence, becoming someone your younger self would unclench around.`],
  [d(2026,3,2),  `first warm day\nthe whole street came outside at once, blinking, like the building had exhaled. nobody said the obvious thing. everyone was thinking it. winter keeps no forwarding address.`],
  [d(2026,2,25), `on being misread\nit stung, then it taught. the version of me he argued with is not one i have to defend. i can just put it down. you are not obligated to inhabit every room someone builds for you.`],
  [d(2026,2,18), `kept from the long call\nshe is not okay and said so plainly and that plainness was the gift. i have spent years dressing my not-okay in competence. tonight i tried the plain way. it held.`],
  [d(2026,2,11), `a quiet inventory\none good pen. two friends who would come at 3am. the smell of the stairwell that means home. a body that mostly still does what i ask. i have been counting the wrong things.`],
  [d(2026,2,3),  `february, the short month\ndoes more than its size suggests, which is the most i can hope to be said of me. small, and not therefore minor.`],
  [d(2026,1,28), `the thing about resolutions\nis that the year does not begin in january. it begins on the random tuesday you actually change. i have had several januaries. only a few tuesdays.`],
  [d(2026,1,21), `snow, and the city went polite\nsound came off the streets. everyone walked like they'd been asked to be gentle. a whole town remembering, for a morning, how to be careful with a place.`],
  [d(2026,1,14), `for the notebook\nstop optimizing the rest. rest is not a problem to solve into efficiency. it is the part where you are simply a person and not a process. let it be slow and useless and yours.`],
  [d(2026,1,6),  `back at the desk\nthe holidays were warm and loud and i missed this. the quiet has a texture you only feel after a crowd. hello, page. it has been a minute.`],
  [d(2025,12,30), `last note of the year\ni did not become the person i listed. i became a nearer one, by accident, in the parts i wasn't grading. maybe that is the only way it ever goes. keep the page. start again.`],
  [d(2025,12,22), `the dark before the turn\nshortest day. from here the light only gains. i like a calendar that builds the comeback into the bottom of the year. nothing has to be earned. it just returns.`],
  [d(2025,12,15), `something my father said\n"measure the work by whether you'd do it if no one clapped." i have been clapping for myself in advance for years. trying, lately, to just do the quiet thing.`],
  [d(2025,12,8),  `early dark\nthe lamp does more work in december. i resent and then love it. a small warm circle and the page inside it. you do not need a large life. you need a lit one.`],
];

function wordsOf(body) { return (body.replace(/\n/g, ' ').match(/\S+/g) || []).length; }
function firstLine(body) { return body.split('\n')[0]; }

// "19 MAY" — slip face
function slipDay(dt) { return String(dt.getDate()).padStart(2, '0') + ' ' + MONTHS[dt.getMonth()]; }
// "MAY 2026" — floating month marker
function monthMark(dt) { return MONTHS[dt.getMonth()] + ' ' + dt.getFullYear(); }
// "19 MAY 2026" — reader stamp (matches the app's keep stamp)
function fullStamp(dt) { return String(dt.getDate()).padStart(2,'0') + ' ' + MONTHS[dt.getMonth()] + ' ' + dt.getFullYear(); }
// "kept 19 may 2026" — reader foot
function keptLine(dt) { return 'kept ' + String(dt.getDate()).padStart(2,'0') + ' ' + MONTHS[dt.getMonth()].toLowerCase() + ' ' + dt.getFullYear(); }

const KEPT_NOTES = RAW_NOTES.map(([dt, body], i) => ({
  id: 'n' + i,
  date: dt,
  body,
  first: firstLine(body),
  words: wordsOf(body),
  slipDay: slipDay(dt),
  month: monthMark(dt),
}));

window.keptData = { KEPT_NOTES, MONTHS, slipDay, monthMark, fullStamp, keptLine, wordsOf, firstLine };
