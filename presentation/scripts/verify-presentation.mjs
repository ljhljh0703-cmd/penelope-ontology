import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const deck = readFileSync(resolve(root, "live-pitch.html"), "utf8");
const pitch = readFileSync(resolve(root, "LIVE-PITCH.md"), "utf8");

const fail = (message) => {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
};

const scenePattern = /<section id="([^"]+)" class="scene clip[^\"]*" data-start="([0-9.]+)" data-duration="([0-9.]+)"/g;
const scenes = [...html.matchAll(scenePattern)].map((match) => ({
  id: match[1],
  start: Number(match[2]),
  duration: Number(match[3]),
}));

if (scenes.length !== 8) fail(`expected 8 scenes, found ${scenes.length}`);
for (let index = 0; index < scenes.length; index += 1) {
  const scene = scenes[index];
  if (!Number.isFinite(scene.start) || !Number.isFinite(scene.duration) || scene.duration <= 0) {
    fail(`invalid timing for ${scene.id}`);
  }
  if (index > 0) {
    const previous = scenes[index - 1];
    const previousEnd = previous.start + previous.duration;
    if (Math.abs(previousEnd - scene.start) > 0.001) {
      fail(`timeline gap or overlap: ${previous.id} ends ${previousEnd}, ${scene.id} starts ${scene.start}`);
    }
  }
}

const total = scenes.at(-1)?.start + scenes.at(-1)?.duration;
if (Math.abs(total - 82) > 0.001) fail(`expected 82-second timeline, found ${total}`);

const requiredFiles = [
  "audio/narration.wav",
  "assets/choice-weaver.png",
  "assets/causal-reversal.png",
  "assets/world-pack-portability.png",
  "NARRATION.en.txt",
  "NARRATION.ko.md",
  "STORYBOARD.md",
  "LIVE-PITCH.md",
  "live-pitch.html",
  "frame.md",
];
for (const file of requiredFiles) {
  const path = resolve(root, file);
  if (!existsSync(path) || statSync(path).size === 0) fail(`missing or empty ${file}`);
}

const publicCopy = `${html}\n${deck}\n${pitch}`.toLowerCase();
for (const forbidden of [
  "codex beats claude",
  "autonomous society",
  "full-novel simulation",
  "graph database backend",
  "proven productivity gain",
]) {
  if (publicCopy.includes(forbidden)) fail(`forbidden public claim: ${forbidden}`);
}

const renderCandidates = [
  resolve(root, "renders/penelope-presentation.mp4"),
  resolve(root, "renders/penelope-presentation-draft.mp4"),
];
const render = renderCandidates.find((candidate) => existsSync(candidate) && statSync(candidate).size > 0);
if (render) {
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-show_streams", "-of", "json", render],
      { encoding: "utf8" },
    ),
  );
  const duration = Number(probe.format?.duration);
  if (Math.abs(duration - 82) > 0.15) fail(`render duration ${duration} is not 82 seconds`);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (!video || video.width !== 1920 || video.height !== 1080) fail("render is not 1920x1080 video");
  if (!audio) fail("render has no audio stream");
}

if (!process.exitCode) {
  console.log(`PASS scenes=${scenes.length} duration=${total}s assets=${requiredFiles.length} claims=clean`);
}
