import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { SAKURA_SCENE } from './sakura.js'

// Catppuccin, converted from the ccthemes gallery's terminal themes:
// Mocha (catppuccin-mocha.json) for dark mode, Latte (catppuccin-latte.json) for light mode,
// with a Catppuccin pink accent and a sakura backdrop (sakura.js).
// Surfaces come from Catppuccin's own base/mantle/surface swatches, since terminal themes set no background.
const { theme, problems } = makeColors({
  label: 'Catppuccin',
  light: {
    roles: { accent: '#ea76cb', danger: '#d20f39', success: '#40a02b', warning: '#df8e1d', pro: '#8839ef' },
    gray: {
      anchors: {
        'surface-0': '#e6e9ef',
        'surface-1': '#eff1f5',
        'surface-2': '#f6f7fa',
        'surface-3': '#f6f7fa',
        'text-primary': '#4c4f69',
        'text-secondary': '#5c5f77',
        'text-muted': '#6c6f85',
      },
    },
  },
  dark: {
    roles: { accent: '#f5c2e7', danger: '#f38ba8', success: '#a6e3a1', warning: '#f9e2af', pro: '#cba6f7' },
    gray: {
      anchors: {
        'surface-0': '#1e1e2e',
        'surface-1': '#232334',
        'surface-2': '#292a3c',
        'surface-3': '#2e2f42',
        'text-primary': '#cdd6f4',
        'text-secondary': '#bac2de',
        'text-muted': '#a6adc8',
      },
    },
  },
})

const SCENE = 'sakura'
const LOOK: ThemeSetArgs = { colors: theme, backdrop: { scene: SCENE, glass: {} } }

export const register: Register = on => {
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.plugin !== $.plugin.name || e.props.scene !== SCENE) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const { Svg } = $.ui.resolve(e)
    return Svg({ source: SAKURA_SCENE, alt: 'Cherry blossom branches with petals drifting down' })
  })

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    const set = await $.theme.set(LOOK)

    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }

    return next(e)
  })
}
