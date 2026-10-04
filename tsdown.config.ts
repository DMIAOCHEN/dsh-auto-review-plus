import { defineConfig } from 'tsdown'

/** Host half: plain ESM, dsh peers stay external (same shape as the shipped plugin). */
const host = {
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: { emitDtsOnly: false },
  outDir: 'lib',
  external: [/^@deepseek-ai\//],
}

/** Client half: CJS bundle wrapped for the browser ModuleLoader (see the wrapper plugin below). */
const client = {
  entry: ['src/client/index.tsx'],
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: { emitDtsOnly: false },
  outDir: 'lib',
  external: [/^@deepseek-ai\//, 'react', 'react-dom', 'react/jsx-runtime'],
  outputOptions: { entryFileNames: 'client.body.js' },
}

export default defineConfig([host, client])
