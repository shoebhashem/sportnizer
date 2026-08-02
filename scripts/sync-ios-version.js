#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const appJsonPath = path.join(projectRoot, "app.json");
const infoPlistPath = path.join(projectRoot, "ios", "clubnizer", "Info.plist");
const pbxprojPath = path.join(
  projectRoot,
  "ios",
  "clubnizer.xcodeproj",
  "project.pbxproj",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertVersion(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Invalid expo.version \"${version}\" in app.json. Expected semantic version like 1.12.0.`,
    );
  }
}

function updateInfoPlist(content, version) {
  const regex =
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)([^<]+)(<\/string>)/;
  if (!regex.test(content)) {
    throw new Error(
      "Could not find CFBundleShortVersionString in ios/clubnizer/Info.plist",
    );
  }
  return content.replace(regex, `$1${version}$3`);
}

function updatePbxproj(content, version) {
  const regex = /MARKETING_VERSION = [^;]+;/g;
  const matches = content.match(regex) || [];
  if (matches.length === 0) {
    throw new Error(
      "Could not find MARKETING_VERSION entries in ios/clubnizer.xcodeproj/project.pbxproj",
    );
  }
  return content.replace(regex, `MARKETING_VERSION = ${version};`);
}

function writeIfChanged(filePath, nextContent) {
  const current = fs.readFileSync(filePath, "utf8");
  if (current !== nextContent) {
    fs.writeFileSync(filePath, nextContent, "utf8");
    return true;
  }
  return false;
}

function main() {
  const appJson = readJson(appJsonPath);
  const version = appJson?.expo?.version;
  assertVersion(version);

  const infoCurrent = fs.readFileSync(infoPlistPath, "utf8");
  const infoUpdated = updateInfoPlist(infoCurrent, version);
  const infoChanged = writeIfChanged(infoPlistPath, infoUpdated);

  const pbxCurrent = fs.readFileSync(pbxprojPath, "utf8");
  const pbxUpdated = updatePbxproj(pbxCurrent, version);
  const pbxChanged = writeIfChanged(pbxprojPath, pbxUpdated);

  if (infoChanged || pbxChanged) {
    console.log(`Synced iOS version to ${version} from app.json`);
  } else {
    console.log(`iOS version already synced at ${version}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
