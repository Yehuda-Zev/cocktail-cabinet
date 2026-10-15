// Level-skip cheat: typing the code anywhere on a game page (outside a text
// field) calls the game's callback, which jumps its difficulty to a high
// level. The code avoids W/A/S/D, arrows and Space, so typing it never
// steers or fires in any game.

export const CHEAT_CODE = 'levelup';

export function onCheatCode(callback, code = CHEAT_CODE) {
  let typed = '';
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-code.length);
    if (typed === code) {
      typed = '';
      callback();
    }
  });
}
