// Neutralize module-level background timers (mail poll, reminder tick,
// HomeOS poll, portfolio sampler) so the golden-capture instance
// only renders pages and never acts on the world. Real timers are restored on
// nextTick, i.e. right after server.js finishes loading, so request handling
// (and its own timeouts) behaves normally.
const realInterval = global.setInterval;
const realTimeout  = global.setTimeout;
const fake = () => { const t = { unref(){return t;}, ref(){return t;}, close(){}, hasRef(){return false;} }; return t; };
global.setInterval = fake;
global.setTimeout  = fake;
process.nextTick(() => { global.setInterval = realInterval; global.setTimeout = realTimeout; });
