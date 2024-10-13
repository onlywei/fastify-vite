import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensure, write, read } from './ioutils.cjs'
import { CACHE_DIR, CACHED_VITE_CONFIG_FILE_NAME } from './sharedPaths.cjs'

/**
 * This is the Vite plugin, not the Fastify plugin.
 *
 * Writes the vite.config properties used by fastify-vite to a JSON file in the node_modules/.cache
 * directory so production builds do not need to import vite nor the actual vite.config  file. This
 * allows vite to remain a devDependency and not need to exist on production Docker images.
 *
 * @returns
 */
export function viteFastify() {
  const jsonFilePath = resolve(CACHE_DIR, CACHED_VITE_CONFIG_FILE_NAME)
  let configToWrite = {}
  let resolvedConfig = {}

  return {
    name: 'vite-fastify',
    async configResolved(config = {}) {
      const { base, build, isProduction, root } = config
      const { assetsDir, outDir, ssr } = build || {}

      // During vite dev builds, this function can be called multiple times. Sometimes, the resolved
      // configs in these executions are missing many properties. Since there is no advantage to
      // running this function during dev, we save build time and prevent errors by returning early.
      if (!isProduction) {
        return
      }

      resolvedConfig = config

      configToWrite = {
        base,
        root,
        build: { assetsDir },
        // Special key that does not exist on Vite's ResolvedConfig type for properties that only
        // belong to this plugin. Also serves as an indicator to FastifyVite that this config was
        // generated by this plugin and is not the dev vite instance.
        fastify: {},
      }

      // For SSR builds, `vite build` is executed twice: once for client and once for server.
      // We need to merge the two configs and make both `outDir` properties available.
      if (ssr) {
        configToWrite.fastify.serverOutDir = outDir
      } else {
        configToWrite.fastify.clientOutDir = outDir
      }

      if (existsSync(jsonFilePath)) {
        const existingJson = JSON.parse(await read(jsonFilePath, 'utf-8'))
        if (existingJson.fastify) {
          configToWrite.fastify = {
            ...existingJson.fastify,
            ...configToWrite.fastify,
          }
        }
      }
    },

    // Write the JSON file after the bundle finishes writing to avoid getting deleted by emptyOutDir
    async writeBundle() {
      if (resolvedConfig.isProduction) {
        await ensure(CACHE_DIR)
        await write(
          jsonFilePath,
          JSON.stringify(configToWrite, undefined, 2),
          'utf-8',
        )
      }
    },
  }
}

export default viteFastify
