// Wraps the CJS client body into the browser ModuleLoader contract:
//   window.__ModuleLoader__.load({ id, factory: (require) => exports })
//
// Ruling #30: the wrapper's own prologue (`var module` / `var exports`) used to
// precede the body, so a body that opened with `"use strict"` lost its directive
// position — the directive prologue only counts at the start of a function body.
// The same bytes then ran sloppy in the browser and strict under Node. The
// directive is hoisted to the factory's first statement here (and re-emitted
// when the body carries none), so the artifact is strict in both runtimes.
import { readFileSync, writeFileSync, rmSync } from 'node:fs'

const id = 'dsh-auto-review-plus'
const body = readFileSync('lib/client.body.js', 'utf8')

/**
 * Split a CommonJS body into its leading `"use strict"` directive and the rest.
 * Comments and whitespace may precede a directive without ending the prologue,
 * so they stay with the remainder instead of being reordered.
 * @param source - the raw bundle body.
 * @returns the directive statement (empty when the body declares none) and the
 *   remaining source with that statement removed.
 */
function takeDirective(source) {
	const match = /^((?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*)((?:"use strict"|'use strict')\s*;?[ \t]*(?:\r?\n)?)/.exec(source)
	if (match === null) return { directive: '', rest: source }
	return { directive: match[2].trim(), rest: match[1] + source.slice(match[0].length) }
}

const { directive, rest } = takeDirective(body)
const wrapped = `window.__ModuleLoader__.load({
	id: ${JSON.stringify(id)},
	factory: (require) => {
		${directive === '' ? "'use strict';" : directive}
		var module = { exports: {} };
		var exports = module.exports;
${rest}
		return module.exports;
	},
});
`
writeFileSync('lib/client.js', wrapped)
rmSync('lib/client.body.js')
