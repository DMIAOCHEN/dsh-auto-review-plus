// Wraps the CJS client body into the browser ModuleLoader contract:
//   window.__ModuleLoader__.load({ id, factory: (require) => exports })
import { readFileSync, writeFileSync, rmSync } from 'node:fs'

const id = 'dsh-auto-review-plus'
const body = readFileSync('lib/client.body.js', 'utf8')
const wrapped = `window.__ModuleLoader__.load({
	id: ${JSON.stringify(id)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
${body}
		return module.exports;
	},
});
`
writeFileSync('lib/client.js', wrapped)
rmSync('lib/client.body.js')
