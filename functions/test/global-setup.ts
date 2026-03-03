/**
 * Global setup for integration tests.
 * Verifies that Firebase emulators are running before tests start.
 */
export default async function globalSetup() {
  // Set emulator environment variables
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
  process.env.GCLOUD_PROJECT = "sportnizer";

  // Verify emulators are running
  const http = await import("http");
  const checkEmulator = (port: number, name: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        reject(
          new Error(
            `${name} emulator is not running on port ${port}. ` +
              `Start emulators first: npm run emulators`,
          ),
        );
      });
      req.setTimeout(2000, () => {
        req.destroy();
        reject(new Error(`${name} emulator timeout on port ${port}`));
      });
    });

  try {
    await Promise.all([
      checkEmulator(8080, "Firestore"),
      checkEmulator(9099, "Auth"),
    ]);
    console.log("\n✅ Firebase emulators detected — running tests\n");
  } catch (error) {
    console.error("\n❌ " + (error as Error).message);
    console.error(
      "   Run: cd functions && npm run emulators  (in a separate terminal)\n",
    );
    process.exit(1);
  }
}
