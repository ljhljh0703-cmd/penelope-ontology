# Penelope presentation QA receipt

Date: 2026-07-22

## Result

`CREATOR_ACCEPTED / PUBLICATION_PENDING`

The HTML composition, live-pitch deck, English narration track, and 1080p Hyperframes export are complete. Technical and claim gates pass. The creator accepted the presentation, pitch direction, and current English voice on 2026-07-22. Publication remains separately gated.

## Source and render

- Git branch: `codex/presentation-video`
- Base commit: `07c7c9db1d326b4c5d6a113e00a9fde7fa5bd456`
- Hyperframes: `0.7.66`
- Composition: 8 contiguous scenes, 82 seconds
- Final export: `renders/penelope-presentation.mp4`
- MP4 SHA-256: `fe0491df79654d86333e292f04a9e12862495385382cacdcb5ceb54ed0d1fb4b`
- Video: H.264 High, 1920×1080, 30 fps, 2,460 frames
- Audio: AAC, 48 kHz, stereo
- Duration: 82.005333 seconds
- Size: 31,660,465 bytes

## Verification

| Gate | Result |
|---|---|
| `hyperframes lint` | 0 errors; one bounded 8-scene track warning; one non-interactive overlay info item |
| Presentation verifier | PASS · 8 scenes · 82 seconds · 10 required assets · forbidden-claim scan clean |
| Hyperframes keyframes | 8/8 captured at scene midpoints |
| Browser deck | 1920×1080 slide 1 and causal-reversal slide captured; navigation and fullscreen control present |
| Video probe | H.264 + AAC, 1920×1080, 30 fps, 2,460 frames |
| Black-frame scan | 0 detected intervals |
| Audio tail | narration ends at 78.20 seconds; 3.81-second intentional end-card hold |
| Dependency audit | 0 vulnerabilities after overriding transitive `adm-zip` to 0.6.0 |
| Security compatibility snapshot | Post-override Hyperframes snapshot PASS; pixel PSNR average 116.07 dB against pre-override snapshot |
| Git whitespace | `git diff --check` PASS |

The single-track warning is accepted for this bounded 8-scene artifact. Splitting every scene into sub-compositions would increase revision surface without changing the render contract. The composition remains deterministic and each scene has a stable ID.

## Claim boundary

- `Codex can't write?` is presented as a familiar creator-side perception and a question, not a benchmark result.
- The presentation does not claim universal writing superiority.
- The hosted fixture is not presented as a live GPT-5.6 result.
- The product is presented as a bounded causal story simulator, not a graph database, autonomous society, or full-novel simulator.
- World Forge is described as a creator-approved five-scene episode workflow.

## Remaining external action

Public upload is not authorized by this acceptance. No upload was performed.
