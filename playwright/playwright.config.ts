import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

dotenv.config();

// iPhone 14 dimensions: 390×844 logical pixels
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;

export default defineConfig({
  testDir: "./scripts",
  outputDir: "../videos",
  timeout: 420_000, // 7 min max per video step (email + external flows)
  expect: { timeout: 15_000 },

  use: {
    baseURL: process.env.BASE_URL || "https://app.clubnizer.com",
    browserName: "chromium",

    // iPhone 14 emulation — looks like a real phone in the recording
    ...devices["iPhone 14"],
    viewport: { width: PHONE_WIDTH, height: PHONE_HEIGHT },

    // Record every test as a video
    video: {
      mode: "on",
      size: { width: PHONE_WIDTH, height: PHONE_HEIGHT },
    },

    // Slow down all actions so movements are clearly visible in the video
    slowMo: 700,

    screenshot: "off",
    trace: "off",
  },

  // Run videos one at a time — no parallel recording
  workers: 1,
  retries: 0,

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
});
