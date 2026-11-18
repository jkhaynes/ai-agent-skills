// A sakura backdrop: blossoming branches reaching in from the edges (both top corners, both
// sides and the bottom-left), with petals drifting down. The middle stays clear for the
// conversation and the prompt.
// The ground follows the person's mode via prefers-color-scheme (Mocha base / Latte mantle).

// Each branch sits in its own 1000x680 box pinned to one edge of the screen, so it stays in
// its corner on any window shape.
// wood: [path, width]; flowers: [x, y, scale, rotation]
const BRANCHES = [
  {
    // top-right, the big one
    pin: 'xMaxYMin',
    at: 'translate(380 0)',
    wood: [
      ['M640,10 C560,40 470,70 400,85 C330,100 260,130 150,190', 9],
      ['M470,68 C480,100 470,130 445,160', 5],
      ['M330,100 C320,125 300,145 270,140', 4],
      ['M560,40 C575,70 590,90 590,115', 3.5],
      ['M260,132 C240,150 215,165 190,160', 3],
    ],
    flowers: [
      [560, 40, 1.3, 10], [520, 70, 1.0, 40], [470, 52, 1.15, 75], [430, 95, 0.9, 20],
      [395, 70, 1.2, 55], [350, 112, 1.0, 5], [310, 95, 0.85, 35], [270, 135, 1.1, 60],
      [235, 120, 0.8, 15], [200, 160, 0.95, 45], [500, 120, 0.85, 30], [455, 150, 1.0, 65],
      [410, 175, 0.8, 10], [585, 110, 0.9, 50], [330, 165, 0.75, 25], [160, 185, 0.7, 70],
    ],
  },
  {
    // top-left, reaching down and in
    pin: 'xMinYMin',
    at: 'translate(0 0)',
    wood: [
      ['M-20,30 C40,50 110,70 170,105 C215,130 250,160 280,200', 8],
      ['M110,72 C130,45 160,30 195,25', 4],
      ['M200,125 C230,120 260,125 290,140', 3.5],
      ['M60,52 C70,85 70,110 60,135', 3],
    ],
    flowers: [
      [40, 40, 1.1, 20], [90, 62, 0.9, 50], [135, 40, 1.0, 5], [190, 25, 0.85, 35],
      [160, 100, 1.15, 65], [60, 120, 0.85, 15], [205, 130, 0.95, 40], [250, 160, 1.0, 10],
      [285, 140, 0.8, 55], [280, 200, 0.85, 30], [115, 95, 0.7, 70],
    ],
  },
  {
    // right side, lower: a spray coming in from the edge
    pin: 'xMaxYMid',
    at: 'translate(0 120)',
    wood: [
      ['M1020,330 C960,320 900,330 850,355 C815,372 790,392 770,420', 7],
      ['M900,328 C885,300 870,285 845,275', 3.5],
      ['M840,360 C830,390 830,410 840,435', 3],
    ],
    flowers: [
      [990, 325, 1.0, 15], [945, 318, 0.9, 45], [895, 330, 1.05, 70], [850, 355, 0.95, 25],
      [845, 275, 0.85, 50], [870, 290, 0.7, 10], [800, 395, 1.0, 60], [770, 420, 0.8, 35],
      [840, 435, 0.85, 5], [920, 352, 0.75, 30],
    ],
  },
  {
    // left side, middle: a small twig
    pin: 'xMinYMid',
    at: 'translate(0 40)',
    wood: [
      ['M-20,300 C30,290 80,295 120,310 C145,320 165,335 180,350', 5],
      ['M70,293 C80,270 95,258 115,252', 3],
    ],
    flowers: [
      [25, 292, 0.9, 30], [75, 292, 0.8, 60], [115, 252, 0.85, 15], [125, 312, 0.95, 45],
      [175, 345, 0.75, 20], [95, 268, 0.65, 50],
    ],
  },
  {
    // bottom-left
    pin: 'xMinYMax',
    at: 'translate(0 260)',
    wood: [
      ['M-20,400 C30,360 80,330 130,312 C160,300 185,295 205,298', 6],
      ['M90,326 C95,305 105,295 120,290', 3],
    ],
    flowers: [
      [40, 330, 1.0, 20], [85, 300, 0.85, 50], [125, 318, 0.95, 5], [160, 285, 0.75, 35],
      [65, 360, 0.7, 60], [195, 300, 0.65, 15],
    ],
  },
]

const branch = ({ pin, at, wood, flowers }) =>
  `<svg x="0" y="0" width="1600" height="1000" viewBox="0 0 1000 680" preserveAspectRatio="${pin} meet" overflow="visible"><g transform="${at}">` +
  wood.map(([d, w]) => `<path class="wood" stroke-width="${w}" d="${d}"/>`).join('') +
  flowers.map(([x, y, s, r]) => `<use href="#b" transform="translate(${x} ${y}) rotate(${r}) scale(${s})"/>`).join('') +
  '</g></svg>'

// Falling petals: start x (0-1600), duration s, delay s, scale, sway class
const PETALS = [
  [1500, 16, 0, 1.1, 'a'], [1350, 19, -4, 0.8, 'b'], [1180, 14, -9, 1.0, 'a'], [1420, 22, -13, 0.7, 'b'],
  [1250, 17, -6, 0.9, 'b'], [1560, 20, -11, 0.8, 'a'], [980, 24, -2, 0.7, 'a'], [120, 21, -7, 0.8, 'b'],
  [260, 18, -15, 0.9, 'a'], [60, 25, -3, 0.7, 'b'], [1100, 26, -18, 0.6, 'b'], [1460, 15, -8, 1.0, 'b'],
  [340, 23, -10, 0.8, 'b'], [180, 19, -12, 0.9, 'a'],
]

const petals = PETALS.map(
  ([x, d, delay, s, sway]) =>
    `<g class="fall ${sway}" style="animation-duration:${d}s;animation-delay:${delay}s">` +
    `<g transform="translate(${x} -40) scale(${s})"><use href="#p" class="spin" style="animation-duration:${(d / 3).toFixed(1)}s"/></g></g>`,
).join('')

export const SAKURA_SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
<style>
.ground{fill:#1e1e2e}
.wood{fill:none;stroke:#5b4045;stroke-linecap:round}
.petal{fill:#f5c2e7}
.petal2{fill:#f2a7c8}
.heart{fill:#fbe3f1}
.dot{fill:#e0789f}
.drift .petal{opacity:.85}
@media (prefers-color-scheme: light){
 .ground{fill:#e6e9ef}
 .wood{stroke:#7a5a5f}
 .petal{fill:#f4b6d2}
 .petal2{fill:#ea8fbb}
 .heart{fill:#fff3f9}
 .dot{fill:#c2507f}
}
.fall{animation-name:fall;animation-timing-function:linear;animation-iteration-count:infinite}
.fall.b{animation-name:fall2}
.spin{transform-box:fill-box;transform-origin:center;animation-name:spin;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
@keyframes fall{0%{transform:translate(0,0)}25%{transform:translate(-60px,280px)}50%{transform:translate(20px,560px)}75%{transform:translate(-80px,840px)}100%{transform:translate(-30px,1100px)}}
@keyframes fall2{0%{transform:translate(0,0)}25%{transform:translate(50px,280px)}50%{transform:translate(-40px,560px)}75%{transform:translate(70px,840px)}100%{transform:translate(10px,1100px)}}
@keyframes spin{from{transform:rotate(-40deg) scaleX(1)}to{transform:rotate(140deg) scaleX(.4)}}
@media (prefers-reduced-motion: reduce){.fall,.spin{animation:none}.drift{display:none}}
</style>
<defs>
<symbol id="p" viewBox="-8 -8 16 16" width="28" height="28" overflow="visible"><path class="petal" d="M0,-7 C5,-7 7,-1 0,7 C-7,-1 -5,-7 0,-7Z"/></symbol>
<g id="b">
 <path class="petal" d="M0,0 C-6,-4 -6,-13 0,-15 C6,-13 6,-4 0,0Z"/>
 <path class="petal2" transform="rotate(72)" d="M0,0 C-6,-4 -6,-13 0,-15 C6,-13 6,-4 0,0Z"/>
 <path class="petal" transform="rotate(144)" d="M0,0 C-6,-4 -6,-13 0,-15 C6,-13 6,-4 0,0Z"/>
 <path class="petal2" transform="rotate(216)" d="M0,0 C-6,-4 -6,-13 0,-15 C6,-13 6,-4 0,0Z"/>
 <path class="petal" transform="rotate(288)" d="M0,0 C-6,-4 -6,-13 0,-15 C6,-13 6,-4 0,0Z"/>
 <circle class="heart" r="3.2"/><circle class="dot" r="1.3"/>
</g>
</defs>
<rect class="ground" x="-100" y="-100" width="1800" height="1200"/>
${BRANCHES.map(branch).join('\n')}
<g class="drift">${petals}</g>
</svg>`
