// Floating buttons (FAB, floating toolbar) reserve space at the bottom of the page, so the footer
// and the last content are never hidden behind them.
let count = 0;

export function reserveFloatingSpace(): () => void {
  count++;
  document.documentElement.style.setProperty('--floating-space', '80px');
  return () => {
    count--;
    if (count === 0) document.documentElement.style.setProperty('--floating-space', '0px');
  };
}
