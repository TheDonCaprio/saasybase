import path from 'path';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		setupFiles: [path.resolve(__dirname, 'tests/vitest.setup.ts')],
		exclude: [...configDefaults.exclude, 'tests/e2e/**'],
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, '.'),
			// Next.js uses `server-only` as a compile-time guard. In Vitest it would throw
			// during import, so we alias it to an empty module.
			'server-only': path.resolve(__dirname, 'tests/mocks/server-only.ts'),
		},
	},
});
