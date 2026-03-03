/**
 * Global teardown for integration tests.
 * Cleans up any global resources.
 */
export default async function globalTeardown() {
  // Nothing to clean up — emulators manage their own lifecycle
  console.log("\n✅ Tests complete\n");
}
